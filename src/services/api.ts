/**
 * File Purpose: Unified IPC client gateway connecting React frontend with Tauri Rust backend and GitHub release service.
 * Communication Matrix: Imported by App.tsx, hooks, and deck/director components; communicates with Tauri Rust commands in src-tauri/src/commands/.
 */

import {
  Media,
  HardwareTelemetry,
  ModelVaultStatus,
  AppUpdateInfo,
  AppSettings,
  ScrapedMedia,
  Character,
  RelationshipLink,
  BeatSheet,
  CinematographyCue,
  LoreNote,
  ModelStatusItem,
} from '../types';
import { isNewer } from '../utils/semver';
import { extractSha256ForAsset } from '../utils/releaseDigest';
import versionData from '../../version.json';

export const isTauri = () => {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
};

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
    if (err instanceof Error) throw err;
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
}

export interface InferenceParams {
  prompt: string;
  title?: string;
  genres?: string[];
  synopsis?: string;
  mediaType?: string;
  temperature?: number;
  maxTokens?: number;
  clientId?: string;
}

export interface InferenceResult {
  generatedText: string;
  modelUsed: string;
  totalTokens: number;
  generationTimeMs: number;
}

const SUITE_KEY_PREFIX = /^cinevault_(characters|relationships|lore_notes|beats|cinematography)_/;

interface VaultBundle {
  format: 'cinevault-vault-bundle';
  version: 1;
  vault: unknown;
  suite: Record<string, unknown>;
}

interface SuiteMigrationBundle {
  characters: Record<string, unknown[]>;
  relationships: Record<string, unknown[]>;
  beatSheets: Record<string, unknown>;
  cinematographyCues: Record<string, unknown[]>;
  loreNotes: Record<string, unknown[]>;
}

function createEmptyMigrationBundle(): SuiteMigrationBundle {
  return {
    characters: {},
    relationships: {},
    beatSheets: {},
    cinematographyCues: {},
    loreNotes: {},
  };
}

function appendSuiteEntryToBundle(
  bundle: SuiteMigrationBundle,
  key: string,
  parsedValue: unknown
): number {
  const nowIso = new Date().toISOString();

  if (key.startsWith('cinevault_characters_') && Array.isArray(parsedValue) && parsedValue.length > 0) {
    const mediaId = key.replace('cinevault_characters_', '');
    bundle.characters[mediaId] = (parsedValue as Character[]).map((c) => ({
      ...c,
      mediaId,
      createdAt: c.createdAt || nowIso,
      updatedAt: c.updatedAt || nowIso,
    }));
    return parsedValue.length;
  }

  if (key.startsWith('cinevault_relationships_') && Array.isArray(parsedValue) && parsedValue.length > 0) {
    const mediaId = key.replace('cinevault_relationships_', '');
    bundle.relationships[mediaId] = (parsedValue as RelationshipLink[]).map((r, idx) => ({
      id: (r as RelationshipLink & { id?: string }).id || `rel_${mediaId}_${r.sourceCharacterId}_${r.targetCharacterId}_${idx}`,
      mediaId,
      sourceCharacterId: r.sourceCharacterId,
      targetCharacterId: r.targetCharacterId,
      relationshipType: r.relationshipType,
      tensionScore: r.tensionScore,
      notes: r.notes || null,
      createdAt: (r as RelationshipLink & { createdAt?: string }).createdAt || nowIso,
    }));
    return parsedValue.length;
  }

  if (
    key.startsWith('cinevault_beats_') &&
    parsedValue &&
    typeof parsedValue === 'object' &&
    Array.isArray((parsedValue as { beats?: unknown }).beats)
  ) {
    const mediaId = key.replace('cinevault_beats_', '');
    const parsedObj = parsedValue as { framework?: string; beats: unknown[] };
    bundle.beatSheets[mediaId] = {
      id: `sheet_${mediaId}`,
      mediaId,
      framework: parsedObj.framework || 'save-the-cat',
      title: `${mediaId} Beat Sheet`,
      logline: null,
      beatsJson: JSON.stringify(parsedObj.beats),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    return 1;
  }

  if (key.startsWith('cinevault_cinematography_') && Array.isArray(parsedValue) && parsedValue.length > 0) {
    const mediaId = key.replace('cinevault_cinematography_', '');
    bundle.cinematographyCues[mediaId] = (parsedValue as CinematographyCue[]).map((c, idx) => ({
      id: c.id || `cue_${mediaId}_${idx + 1}`,
      mediaId,
      sceneTitle: c.sceneTitle,
      dominantColor: c.colorPalette?.dominant || '#0a0a0f',
      accentColor: c.colorPalette?.accent || '#d4af37',
      shadowColor: c.colorPalette?.shadow || '#050508',
      lightingStyle: c.lightingStyle || null,
      lensChoice: c.lensChoice || null,
      aspectRatio: c.aspectRatio || null,
      audioNotes: c.audioThemeNotes || null,
      createdAt: c.createdAt || nowIso,
    }));
    return parsedValue.length;
  }

  if (key.startsWith('cinevault_lore_notes_') && Array.isArray(parsedValue) && parsedValue.length > 0) {
    const mediaId = key.replace('cinevault_lore_notes_', '');
    bundle.loreNotes[mediaId] = (parsedValue as LoreNote[]).map((n, idx) => ({
      ...n,
      id: n.id || `lore_${mediaId}_${idx + 1}`,
      mediaId,
      createdAt: n.createdAt || nowIso,
      updatedAt: nowIso,
    }));
    return parsedValue.length;
  }

  return 0;
}

function toMigrationPayload(bundle: SuiteMigrationBundle): Record<string, unknown> {
  return {
    characters: Object.keys(bundle.characters).length > 0 ? bundle.characters : undefined,
    relationships: Object.keys(bundle.relationships).length > 0 ? bundle.relationships : undefined,
    beatSheets: Object.keys(bundle.beatSheets).length > 0 ? bundle.beatSheets : undefined,
    cinematographyCues:
      Object.keys(bundle.cinematographyCues).length > 0 ? bundle.cinematographyCues : undefined,
    loreNotes: Object.keys(bundle.loreNotes).length > 0 ? bundle.loreNotes : undefined,
  };
}

function downloadJsonFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  getTelemetry: () => tauriInvoke<HardwareTelemetry>('get_telemetry'),

  getAllMedia: () => tauriInvoke<Media[]>('get_all_media'),
  extractImdb: (imdbUrl: string) => tauriInvoke<ScrapedMedia>('extract_imdb', { imdbUrl }),
  saveMedia: (media: Media) => tauriInvoke<string>('save_media_entry', { media }),
  deleteMedia: (mediaId: string) => tauriInvoke<boolean>('delete_media_entry', { mediaId }),

  getAppSettings: () => tauriInvoke<AppSettings | null>('get_app_settings'),
  saveAppSettings: (settings: Partial<AppSettings>) =>
    tauriInvoke<boolean>('save_app_settings', { settings }),

  getModelVaultStatus: () => tauriInvoke<ModelVaultStatus>('get_model_vault_status'),
  setActiveAiModel: (modelId: string) => tauriInvoke<boolean>('set_active_ai_model', { modelId }),
  downloadAiModel: (modelId: string) => tauriInvoke<string>('download_ai_model', { modelId }),
  importCustomModel: (sourcePath: string, displayName: string) =>
    tauriInvoke<ModelStatusItem>('import_custom_model', { sourcePath, displayName }),
  generateAISummary: (params: InferenceParams) =>
    tauriInvoke<InferenceResult>('generate_ai_summary', { request: params }),

  exportDatabaseJson: () => tauriInvoke<string>('export_database_json'),
  importDatabaseJson: (jsonContent: string) =>
    tauriInvoke<boolean>('import_database_json', { jsonContent }),

  importPosterAsset: (sourcePath: string) =>
    tauriInvoke<string>('import_poster_asset', { sourcePath }),

  getCharacters: (mediaId: string) =>
    tauriInvoke<Character[]>('get_characters', { mediaId }),
  saveCharacters: (mediaId: string, characters: Character[]) => {
    const payload = characters.map((c) => ({
      ...c,
      mediaId,
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
    }));
    return tauriInvoke<boolean>('save_characters', { mediaId, characters: payload });
  },

  getRelationships: async (mediaId: string): Promise<RelationshipLink[]> => {
    const records = await tauriInvoke<any[]>('get_relationships', { mediaId });
    return (records || []).map((r) => ({
      sourceCharacterId: r.sourceCharacterId,
      targetCharacterId: r.targetCharacterId,
      relationshipType: r.relationshipType,
      tensionScore: r.tensionScore,
      notes: r.notes || undefined,
    }));
  },
  saveRelationships: (mediaId: string, relationships: RelationshipLink[]) => {
    const nowIso = new Date().toISOString();
    const payload = relationships.map((r, idx) => ({
      id: (r as any).id || `rel_${mediaId}_${r.sourceCharacterId}_${r.targetCharacterId}_${idx}`,
      mediaId,
      sourceCharacterId: r.sourceCharacterId,
      targetCharacterId: r.targetCharacterId,
      relationshipType: r.relationshipType,
      tensionScore: r.tensionScore,
      notes: r.notes || null,
      createdAt: (r as any).createdAt || nowIso,
    }));
    return tauriInvoke<boolean>('save_relationships', { mediaId, relationships: payload });
  },

  getBeatSheet: async (mediaId: string): Promise<BeatSheet | null> => {
    const record = await tauriInvoke<any | null>('get_beat_sheet', { mediaId });
    if (!record) return null;
    let beats: any[] = [];
    if (Array.isArray(record.beats)) {
      beats = record.beats;
    } else if (typeof record.beatsJson === 'string' && record.beatsJson.trim().length > 0) {
      try {
        beats = JSON.parse(record.beatsJson);
      } catch {
        beats = [];
      }
    }
    return {
      id: record.id,
      mediaId: record.mediaId,
      framework: record.framework,
      title: record.title,
      logline: record.logline || undefined,
      beats,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  },
  saveBeatSheet: (beatSheet: BeatSheet) => {
    const nowIso = new Date().toISOString();
    const payload = {
      id: beatSheet.id || `sheet_${beatSheet.mediaId}`,
      mediaId: beatSheet.mediaId,
      framework: beatSheet.framework,
      title: beatSheet.title,
      logline: beatSheet.logline || null,
      beatsJson: JSON.stringify(beatSheet.beats || []),
      createdAt: beatSheet.createdAt || nowIso,
      updatedAt: nowIso,
    };
    return tauriInvoke<boolean>('save_beat_sheet', { beatSheet: payload });
  },

  getCinematographyCues: async (mediaId: string): Promise<CinematographyCue[]> => {
    const records = await tauriInvoke<any[]>('get_cinematography_cues', { mediaId });
    return (records || []).map((r) => ({
      id: r.id,
      mediaId: r.mediaId,
      sceneTitle: r.sceneTitle,
      colorPalette: r.colorPalette || {
        dominant: r.dominantColor || '#0a0a0f',
        accent: r.accentColor || '#d4af37',
        shadow: r.shadowColor || '#050508',
      },
      lightingStyle: r.lightingStyle || undefined,
      lensChoice: r.lensChoice || undefined,
      aspectRatio: r.aspectRatio || undefined,
      audioThemeNotes: r.audioThemeNotes || r.audioNotes || undefined,
      createdAt: r.createdAt,
    }));
  },
  saveCinematographyCues: (mediaId: string, cues: CinematographyCue[]) => {
    const nowIso = new Date().toISOString();
    const payload = cues.map((c, idx) => ({
      id: c.id || `cue_${mediaId}_${idx + 1}`,
      mediaId,
      sceneTitle: c.sceneTitle,
      dominantColor: c.colorPalette?.dominant || '#0a0a0f',
      accentColor: c.colorPalette?.accent || '#d4af37',
      shadowColor: c.colorPalette?.shadow || '#050508',
      lightingStyle: c.lightingStyle || null,
      lensChoice: c.lensChoice || null,
      aspectRatio: c.aspectRatio || null,
      audioNotes: c.audioThemeNotes || null,
      createdAt: c.createdAt || nowIso,
    }));
    return tauriInvoke<boolean>('save_cinematography_cues', { mediaId, cues: payload });
  },

  getLoreNotes: (mediaId: string) =>
    tauriInvoke<LoreNote[]>('get_lore_notes', { mediaId }),
  saveLoreNotes: (mediaId: string, notes: LoreNote[]) => {
    const nowIso = new Date().toISOString();
    const payload = notes.map((n, idx) => ({
      ...n,
      id: n.id || `lore_${mediaId}_${idx + 1}`,
      mediaId,
      createdAt: n.createdAt || nowIso,
      updatedAt: nowIso,
    }));
    return tauriInvoke<boolean>('save_lore_notes', { mediaId, notes: payload });
  },

  migrateSuiteFromLocalStorage: (bundle: unknown) =>
    tauriInvoke<number>('migrate_suite_from_local_storage', { bundle }),

  autoMigrateLocalStorageToDatabase: async (): Promise<number> => {
    if (!isTauri()) return 0;
    if (localStorage.getItem('cinevault_sqlite_migrated_v3') === 'true') {
      return 0;
    }
    const bundle = createEmptyMigrationBundle();
    let totalItems = 0;

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        totalItems += appendSuiteEntryToBundle(bundle, key, JSON.parse(raw));
      } catch {
        continue;
      }
    }

    if (totalItems > 0) {
      try {
        await tauriInvoke<number>('migrate_suite_from_local_storage', {
          bundle: toMigrationPayload(bundle),
        });
      } catch (e) {
        console.error('[Auto-Migrate Error]', e);
        return 0;
      }
    }

    localStorage.setItem('cinevault_sqlite_migrated_v3', 'true');
    return totalItems;
  },

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

      const sorted = [...releases].sort(
        (a, b) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
      );
      const candidate =
        sorted.find((rel) => (rel.assets || []).some((a) => Boolean(a.name && a.name.toLowerCase().endsWith('.exe')))) ||
        sorted[0];

      const assets = (candidate.assets || []).map((a) => {
        const name = a.name ?? '';
        let digest = a.digest ?? '';
        if (!digest && candidate.body) {
          digest = extractSha256ForAsset(name, candidate.body);
        }
        return {
          name,
          size: a.size ?? 0,
          browserDownloadUrl: a.browser_download_url ?? '',
          digest,
        };
      });
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

  downloadAndInstallUpdate: (
    installerUrl: string,
    filename: string,
    expectedSha256: string
  ) =>
    tauriInvoke<boolean>('download_and_install_update', {
      installerUrl,
      filename,
      expectedSha256,
    }),

  minimizeWindow: () => tauriInvoke<void>('app_minimize'),
  maximizeWindow: () => tauriInvoke<void>('app_maximize'),
  closeWindow: () => tauriInvoke<void>('app_close'),
};

export async function exportVaultBundle(): Promise<void> {
  const dateStr = new Date().toISOString().slice(0, 10);
  if (isTauri()) {
    const json = await api.exportDatabaseJson();
    downloadJsonFile(json, `cinevault-vault-backup-${dateStr}.json`);
    return;
  }

  const suiteData: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !SUITE_KEY_PREFIX.test(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      suiteData[key] = JSON.parse(raw);
    } catch {
      suiteData[key] = raw;
    }
  }

  const bundle: VaultBundle = {
    format: 'cinevault-vault-bundle',
    version: 1,
    vault: [],
    suite: suiteData,
  };
  downloadJsonFile(JSON.stringify(bundle, null, 2), `cinevault-vault-backup-${dateStr}.json`);
}

export async function importVaultBundle(
  jsonText: string
): Promise<{ mediaCount: number; suiteKeyCount: number; suiteKeys: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON file: parsing failed.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid CineVault backup file: root must be a JSON object.');
  }

  const candidate = parsed as {
    sha256Checksum?: unknown;
    format?: unknown;
    media?: unknown;
    characters?: unknown;
    relationships?: unknown;
    beatSheets?: unknown;
    cinematographyCues?: unknown;
    loreNotes?: unknown;
    storyArcs?: unknown;
    timelineEvents?: unknown;
  };

  if (typeof candidate.sha256Checksum === 'string' && Array.isArray(candidate.media)) {
    await api.importDatabaseJson(jsonText);
    const mediaCount = candidate.media.length;
    const suiteKeyCount = [
      candidate.characters,
      candidate.relationships,
      candidate.beatSheets,
      candidate.cinematographyCues,
      candidate.loreNotes,
      candidate.storyArcs,
      candidate.timelineEvents,
    ].reduce<number>((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);
    return { mediaCount, suiteKeyCount, suiteKeys: suiteKeyCount };
  }

  if (candidate.format !== 'cinevault-vault-bundle') {
    throw new Error(
      'Invalid CineVault bundle: missing or incorrect "format" identifier.'
    );
  }

  const bundle = parsed as VaultBundle;

  let mediaCount = 0;
  if (Array.isArray(bundle.vault)) {
    for (const item of bundle.vault as Media[]) {
      if (item && item.id && item.title) {
        await api.saveMedia(item);
        mediaCount += 1;
      }
    }
  }

  let suiteKeyCount = 0;
  const migrationBundle = createEmptyMigrationBundle();
  let migratedItems = 0;

  if (bundle.suite && typeof bundle.suite === 'object') {
    for (const [key, val] of Object.entries(bundle.suite)) {
      if (!SUITE_KEY_PREFIX.test(key)) continue;
      const strVal = typeof val === 'string' ? val : JSON.stringify(val);
      localStorage.setItem(key, strVal);
      suiteKeyCount += 1;

      let parsedVal: unknown = val;
      if (typeof val === 'string') {
        try {
          parsedVal = JSON.parse(val);
        } catch {
          parsedVal = null;
        }
      }
      migratedItems += appendSuiteEntryToBundle(migrationBundle, key, parsedVal);
    }
  }

  if (isTauri() && migratedItems > 0) {
    await api.migrateSuiteFromLocalStorage(toMigrationPayload(migrationBundle));
  }

  return { mediaCount, suiteKeyCount, suiteKeys: suiteKeyCount };
}
