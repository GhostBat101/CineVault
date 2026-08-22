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
 *   isTauri()      - true when running inside the Tauri webview (guards
 *                    event-listener setup; browser dev mode has no IPC).
 *   api            - typed facade over every Tauri command + update checker.
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
  generateAISummary: (params: InferenceParams) =>
    // The whole object rides as the `request` argument (InferenceRequest struct).
    tauriInvoke<InferenceResult>('generate_ai_summary', { request: params }),

  // ── Database export / import ─────────────────────────────────────────────
  exportDatabaseJson: () => tauriInvoke<string>('export_database_json'),
  importDatabaseJson: (jsonContent: string) =>
    tauriInvoke<boolean>('import_database_json', { jsonContent }),

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
        assets?: Array<{ name?: string; size?: number; browser_download_url?: string }>;
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

  downloadAndInstallUpdate: (installerUrl: string, filename: string) =>
    tauriInvoke<boolean>('download_and_install_update', { installerUrl, filename }),

  // ── Window controls (native frameless chrome) ────────────────────────────
  minimizeWindow: () => tauriInvoke<void>('app_minimize'),
  maximizeWindow: () => tauriInvoke<void>('app_maximize'),
  closeWindow: () => tauriInvoke<void>('app_close'),
};
