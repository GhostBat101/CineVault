/**
 * services/api.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: The single gateway between the React frontend and the Rust/Tauri
 *       backend, plus the GitHub release-update checker. Every IPC call in
 *       the app goes through `api.*` - there are no other invoke() sites.
 *
 * CASING CONTRACT (important):
 *   - Top-level invoke args are sent camelCase (e.g. `imdbUrl`); Tauri v2
 *     auto-converts them to the snake_case Rust command parameters.
 *   - Struct payloads (Media, InferenceRequest, ...) are camelCase on the
 *     wire because the Rust structs use #[serde(rename_all = "camelCase")].
 *   NEVER send dual keys "just in case" - mismatches now fail loudly here
 *   instead of silently producing undefined fields.
 *
 * USES:    @tauri-apps/api/core (dynamic import), types/index.ts, version.json.
 * USED BY: hooks/useMediaLibrary.ts, hooks/useAISummary.ts,
 *          hooks/useTelemetry.ts, components/deck/IngestModal.tsx,
 *          components/deck/MediaDetailModal.tsx,
 *          components/vault/ModelVaultView.tsx,
 *          components/settings/SettingsView.tsx.
 *
 * KEY EXPORTS:
 *   isTauri()           - true when running inside the Tauri webview (guards
 *                         event-listener setup; browser dev mode has no IPC).
 *   api                 - typed facade over every Tauri command + update checker.
 *   exportVaultBundle() - downloads a bundle file wrapping the SQLite dump AND
 *                         all Director Suite localStorage data.
 *   importVaultBundle() - restores a bundle (or legacy plain dump); returns how
 *                         many Director Suite keys were restored.
 */

import {
  Media,
  HardwareTelemetry,
  ModelVaultStatus,
  AppUpdateInfo,
  AppSettings,
  ScrapedMedia,
} from '../types';
import { isNewer } from '../utils/semver';
import versionData from '../../version.json';

/** True when the app runs inside the Tauri desktop shell (not a plain browser). */
export const isTauri = () => {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
};

/**
 * Invoke a Tauri command and propagate real failures.
 * Unlike the previous version of this module there is NO mock fallback:
 * if the backend errors or the command is unknown the promise rejects and
 * every caller must handle it (loading/error states live in the callers).
 */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error(
      `CineVault requires its desktop runtime. Command "${cmd}" is unavailable outside the Tauri shell.`
    );
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch (err) {
    // Normalize Tauri's error shapes (string | {message} | Error) into Error.
    if (err instanceof Error) throw err;
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
}

/** Shape of the payload accepted by `generate_ai_summary` (mirrors InferenceRequest). */
export interface InferenceParams {
  prompt: string;
  title?: string;
  genres?: string[];
  synopsis?: string;
  mediaType?: string;
  temperature?: number;
  maxTokens?: number;
  /** Correlation id echoed on ai:token events (set per useAISummary instance). */
  clientId?: string;
}

/** Shape returned by `generate_ai_summary` (mirrors InferenceResponse). */
export interface InferenceResult {
  generatedText: string;
  modelUsed: string;
  totalTokens: number;
  generationTimeMs: number;
}

/** Public API Service - one method per registered Tauri command. */
export const api = {
  // ── Telemetry ────────────────────────────────────────────────────────────
  getTelemetry: () => tauriInvoke<HardwareTelemetry>('get_telemetry'),

  // ── Media library & scraping ─────────────────────────────────────────────
  getAllMedia: () => tauriInvoke<Media[]>('get_all_media'),
  extractImdb: (imdbUrl: string) => tauriInvoke<ScrapedMedia>('extract_imdb', { imdbUrl }),
  saveMedia: (media: Media) => tauriInvoke<string>('save_media_entry', { media }),
  /** Permanently delete one entry; resolves true when a row was removed. */
  deleteMedia: (mediaId: string) => tauriInvoke<boolean>('delete_media_entry', { mediaId }),

  // ── Settings persistence (SQLite app_settings table) ─────────────────────
  getAppSettings: () => tauriInvoke<AppSettings | null>('get_app_settings'),
  saveAppSettings: (settings: Partial<AppSettings>) =>
    tauriInvoke<boolean>('save_app_settings', { settings }),

  // ── Local AI generation & model vault ────────────────────────────────────
  getModelVaultStatus: () => tauriInvoke<ModelVaultStatus>('get_model_vault_status'),
  setActiveAiModel: (modelId: string) => tauriInvoke<boolean>('set_active_ai_model', { modelId }),
  downloadAiModel: (modelId: string) => tauriInvoke<string>('download_ai_model', { modelId }),
  /**
   * Register a user-picked local .gguf file into the persistent backend
   * catalog. Returns the persisted ModelStatusItem (id prefixed `custom_`,
   * isInstalled true); it appears in every subsequent getModelVaultStatus().
   */
  importCustomModel: (sourcePath: string, displayName: string) =>
    tauriInvoke<import('../types').ModelStatusItem>('import_custom_model', { sourcePath, displayName }),
  generateAISummary: (params: InferenceParams) =>
    // The whole object rides as the `request` argument (InferenceRequest struct).
    tauriInvoke<InferenceResult>('generate_ai_summary', { request: params }),

  // ── Database export / import ─────────────────────────────────────────────
  exportDatabaseJson: () => tauriInvoke<string>('export_database_json'),
  importDatabaseJson: (jsonContent: string) =>
    tauriInvoke<boolean>('import_database_json', { jsonContent }),

  /**
   * Cache a user-picked local image into the backend poster scope
   * ($CACHE/posters) and return the cached absolute path. The returned path is
   * safe to feed through getPosterSrc()/convertFileSrc for offline previews.
   */
  importPosterAsset: (sourcePath: string) =>
    tauriInvoke<string>('import_poster_asset', { sourcePath }),

  /**
   * On-demand update checker against GitHub Releases.
   * Compares numeric semver cores only ("v0.4.0-beta" -> [0,4,0]); pre-release
   * tags never crash the comparison. Prefers the newest release that ships a
   * Windows .exe installer.
   */
  checkForUpdates: async (): Promise<AppUpdateInfo> => {
    const currentVersion = versionData.version;
    try {
      const response = await fetch('https://api.github.com/repos/GhostBat101/CineVault/releases?per_page=15', {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (!response.ok) {
        throw new Error(`GitHub API returned HTTP ${response.status}`);
      }
      const releases: Array<{
        tag_name?: string;
        name?: string | null;
        body?: string | null;
        published_at?: string | null;
        html_url?: string;
        assets?: Array<{ name?: string; size?: number; browser_download_url?: string; digest?: string }>;
      }> = await response.json();

      if (!Array.isArray(releases) || releases.length === 0) {
        return {
          hasUpdate: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseTitle: 'No Releases Found',
          releaseNotes: 'No releases are currently published on GitHub.',
          publishedAt: '',
          releaseUrl: 'https://github.com/GhostBat101/CineVault/releases',
          assets: [],
        };
      }

      // Semver helpers (parseSemver/isNewer) live in utils/semver.ts and are
      // unit-tested in tests/semver.test.ts.

      // Newest first so "first release with an .exe" really is the newest build.
      const sorted = [...releases].sort(
        (a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
      );
      const candidate =
        sorted.find((rel) => (rel.assets || []).some((a) => Boolean(a.name && a.name.toLowerCase().endsWith('.exe')))) ||
        sorted[0];

      const assets = (candidate.assets || []).map((a) => ({
        name: a.name ?? '',
        size: a.size ?? 0,
        browserDownloadUrl: a.browser_download_url ?? '',
        // GitHub API sha256 digest ("sha256:..."); absent on older releases.
        digest: a.digest ?? '',
      }));
      const candidateTag = (candidate.tag_name || '').replace(/^v/, '');
      const hasExe = assets.some((a) => a.name.toLowerCase().endsWith('.exe'));

      return {
        hasUpdate: hasExe && isNewer(candidateTag, currentVersion),
        currentVersion,
        latestVersion: candidateTag || currentVersion,
        releaseTitle: candidate.name || candidate.tag_name || 'Latest Release',
        releaseNotes: candidate.body || 'No release notes provided.',
        publishedAt: candidate.published_at || '',
        releaseUrl: candidate.html_url || 'https://github.com/GhostBat101/CineVault/releases',
        assets,
      };
    } catch (err: unknown) {
      console.warn('[Check For Updates Error]', err);
      throw new Error(
        `Failed to check for updates: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },

  /**
   * Download and hand off to the release installer. When `expectedSha256` is
   * provided the backend verifies the downloaded file fail-closed before launch.
   */
  downloadAndInstallUpdate: (installerUrl: string, filename: string, expectedSha256?: string) =>
    tauriInvoke<boolean>('download_and_install_update', { installerUrl, filename, expectedSha256 }),

  // ── Window controls (native frameless chrome) ────────────────────────────
  minimizeWindow: () => tauriInvoke<void>('app_minimize'),
  maximizeWindow: () => tauriInvoke<void>('app_maximize'),
  closeWindow: () => tauriInvoke<void>('app_close'),
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Vault bundle export / import (media database + Director Suite data)
 * ─────────────────────────────────────────────────────────────────────────────
 * The SQLite dump alone misses everything stored in localStorage by the
 * Director Suite (characters, relationships, lore notes, beat sheets), so a
 * "vault bundle" wraps BOTH stores in one portable envelope:
 *
 *   { format: 'cinevault-vault-bundle', version: 1,
 *     vault: <parsed export_database_json payload>,
 *     suite: { [localStorageKey]: rawValue } }
 */

/** localStorage keys that hold Director Suite data (per-title `_global`). */
const SUITE_KEY_PREFIX = /^cinevault_(characters|relationships|lore_notes|beats)_/;

/** Portable envelope written by exportVaultBundle / read by importVaultBundle. */
interface VaultBundle {
  format: 'cinevault-vault-bundle';
  version: 1;
  /** Parsed payload of a backend `export_database_json` call. */
  vault: unknown;
  /** Director Suite entries keyed by their localStorage key. */
  suite: Record<string, unknown>;
}

/** Trigger a JSON file download; the blob URL is revoked right after the click. */
function downloadJsonFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export the full vault as a bundle file: the backend database dump plus every
 * Director Suite localStorage key matching SUITE_KEY_PREFIX. Suite values are
 * kept parsed when valid JSON, otherwise as the raw stored string.
 * Resolves once the download has been triggered; rejects on IPC/parse failure.
 */
export async function exportVaultBundle(): Promise<void> {
  // Pass-through contract: backend checksums PRETTY serialization now, so the
  // vault JSON is embedded untouched.
  const vaultJson = await api.exportDatabaseJson();
  const vault: unknown = JSON.parse(vaultJson);

  const suite: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !SUITE_KEY_PREFIX.test(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      suite[key] = JSON.parse(raw);
    } catch {
      suite[key] = raw;
    }
  }

  const bundle: VaultBundle = {
    format: 'cinevault-vault-bundle',
    version: 1,
    vault,
    suite,
  };
  const stamp = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  downloadJsonFile(JSON.stringify(bundle, null, 2), `cinevault_bundle_${stamp}.json`);
}

/**
 * Restore a previously exported bundle (or a legacy plain database export).
 * Bundle format: every suite key is written back into localStorage FIRST so
 * the post-import reload hydrates them, THEN the media database is imported.
 * Legacy plain exports are handed straight to import_database_json.
 * @returns How many Director Suite keys were restored (0 for legacy files).
 */
export async function importVaultBundle(text: string): Promise<{ suiteKeys: number }> {
  let parsed: Partial<VaultBundle> & { format?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid file: content is not valid JSON.');
  }

  if (parsed && parsed.format === 'cinevault-vault-bundle') {
    const suite = parsed.suite ?? {};
    let suiteKeys = 0;
    for (const [key, value] of Object.entries(suite)) {
      if (!SUITE_KEY_PREFIX.test(key)) continue;
      localStorage.setItem(
        key,
        typeof value === 'string' ? value : JSON.stringify(value)
      );
      suiteKeys += 1;
    }
    await api.importDatabaseJson(JSON.stringify(parsed.vault));
    return { suiteKeys };
  }

  // Legacy plain exports carry only the database dump.
  await api.importDatabaseJson(text);
  return { suiteKeys: 0 };
}
