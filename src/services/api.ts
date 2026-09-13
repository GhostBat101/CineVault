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

function extractSha256ForAsset(assetName: string, releaseBody?: string | null): string {
  if (!releaseBody) return '';
  const escapedName = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineMatch = new RegExp(`([a-fA-F0-9]{64})\\s+\\*?${escapedName}`, 'i').exec(releaseBody);
  if (lineMatch) return lineMatch[1].toLowerCase();

  const bsdMatch = new RegExp(`SHA256\\s*\\(${escapedName}\\)\\s*=\\s*([a-fA-F0-9]{64})`, 'i').exec(releaseBody);
  if (bsdMatch) return bsdMatch[1].toLowerCase();

  const reverseMatch = new RegExp(`${escapedName}\\s*[:=]\\s*([a-fA-F0-9]{64})`, 'i').exec(releaseBody);
  if (reverseMatch) return reverseMatch[1].toLowerCase();

  const genericMatch = /sha-?256[:\s=]+([a-fA-F0-9]{64})/i.exec(releaseBody);
  if (genericMatch) return genericMatch[1].toLowerCase();

  return '';
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
    const characters: Record<string, any[]> = {};
    const relationships: Record<string, any[]> = {};
    const beatSheets: Record<string, any> = {};
    const cinematographyCues: Record<string, any[]> = {};
    const loreNotes: Record<string, any[]> = {};
    let totalItems = 0;

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      try {
        if (key.startsWith('cinevault_characters_')) {
          const mediaId = key.replace('cinevault_characters_', '');
          const items = JSON.parse(raw) as Character[];
          if (Array.isArray(items) && items.length > 0) {
            characters[mediaId] = items.map((c) => ({
              ...c,
              mediaId,
              createdAt: c.createdAt || new Date().toISOString(),
              updatedAt: c.updatedAt || new Date().toISOString(),
            }));
            totalItems += items.length;
          }
        } else if (key.startsWith('cinevault_relationships_')) {
          const mediaId = key.replace('cinevault_relationships_', '');
          const items = JSON.parse(raw) as RelationshipLink[];
          if (Array.isArray(items) && items.length > 0) {
            const nowIso = new Date().toISOString();
            relationships[mediaId] = items.map((r, idx) => ({
              id: (r as any).id || `rel_${mediaId}_${r.sourceCharacterId}_${r.targetCharacterId}_${idx}`,
              mediaId,
              sourceCharacterId: r.sourceCharacterId,
              targetCharacterId: r.targetCharacterId,
              relationshipType: r.relationshipType,
              tensionScore: r.tensionScore,
              notes: r.notes || null,
              createdAt: (r as any).createdAt || nowIso,
            }));
            totalItems += items.length;
          }
        } else if (key.startsWith('cinevault_beats_')) {
          const mediaId = key.replace('cinevault_beats_', '');
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.beats)) {
            const nowIso = new Date().toISOString();
            beatSheets[mediaId] = {
              id: `sheet_${mediaId}`,
              mediaId,
              framework: parsed.framework || 'save-the-cat',
              title: `${mediaId} Beat Sheet`,
              logline: null,
              beatsJson: JSON.stringify(parsed.beats),
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            totalItems += 1;
          }
        } else if (key.startsWith('cinevault_cinematography_')) {
          const mediaId = key.replace('cinevault_cinematography_', '');
          const items = JSON.parse(raw) as CinematographyCue[];
          if (Array.isArray(items) && items.length > 0) {
            const nowIso = new Date().toISOString();
            cinematographyCues[mediaId] = items.map((c, idx) => ({
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
            totalItems += items.length;
          }
        } else if (key.startsWith('cinevault_lore_notes_')) {
          const mediaId = key.replace('cinevault_lore_notes_', '');
          const items = JSON.parse(raw) as LoreNote[];
          if (Array.isArray(items) && items.length > 0) {
            const nowIso = new Date().toISOString();
            loreNotes[mediaId] = items.map((n, idx) => ({
              ...n,
              id: n.id || `lore_${mediaId}_${idx + 1}`,
              mediaId,
              createdAt: n.createdAt || nowIso,
              updatedAt: nowIso,
            }));
            totalItems += items.length;
          }
        }
      } catch {
        continue;
      }
    }

    if (totalItems > 0) {
      try {
        await tauriInvoke<number>('migrate_suite_from_local_storage', {
          bundle: {
            characters: Object.keys(characters).length > 0 ? characters : undefined,
            relationships: Object.keys(relationships).length > 0 ? relationships : undefined,
            beatSheets: Object.keys(beatSheets).length > 0 ? beatSheets : undefined,
            cinematographyCues: Object.keys(cinematographyCues).length > 0 ? cinematographyCues : undefined,
            loreNotes: Object.keys(loreNotes).length > 0 ? loreNotes : undefined,
          },
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

  appMinimize: () => tauriInvoke<void>('app_minimize'),
  appMaximize: () => tauriInvoke<void>('app_maximize'),
  appClose: () => tauriInvoke<void>('app_close'),
  minimizeWindow: () => tauriInvoke<void>('app_minimize'),
  maximizeWindow: () => tauriInvoke<void>('app_maximize'),
  closeWindow: () => tauriInvoke<void>('app_close'),
};

export async function exportVaultBundle(): Promise<void> {
  const mediaList = await api.getAllMedia();
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
    vault: mediaList,
    suite: suiteData,
  };

  const json = JSON.stringify(bundle, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadJsonFile(json, `cinevault-vault-backup-${dateStr}.json`);
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

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { format?: string }).format !== 'cinevault-vault-bundle'
  ) {
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
  if (bundle.suite && typeof bundle.suite === 'object') {
    for (const [key, val] of Object.entries(bundle.suite)) {
      if (!SUITE_KEY_PREFIX.test(key)) continue;
      const strVal = typeof val === 'string' ? val : JSON.stringify(val);
      localStorage.setItem(key, strVal);
      suiteKeyCount += 1;
    }
  }

  return { mediaCount, suiteKeyCount, suiteKeys: suiteKeyCount };
}
