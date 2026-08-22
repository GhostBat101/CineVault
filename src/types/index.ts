/**
 * types/index.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: Single source of truth for every shared TypeScript type in the
 *       CineVault frontend. Mirrors the serde structs in src-tauri
 *       (all Tauri payloads are camelCase on the wire via
 *       `#[serde(rename_all = "camelCase")]`).
 *
 * USES:    Nothing (leaf module).
 * USED BY: services/api.ts, hooks/*.ts, components/** (imported everywhere).
 *
 * KEY EXPORTS:
 *   MediaType / WatchStatus / RoleType / ArcType / ImpactLevel /
 *     ThemeName / BeatSheetFramework - string unions constraining entity fields.
 *   Media          - core tracked-title entity (round-trips SQLite `media` table).
 *   Character      - Director's Suite cast member.
 *   StoryArc       - hierarchical narrative arc.
 *   Beat           - one Save-the-Cat! beat (id/name/act/percentage/content).
 *   BeatItem / BeatSheet - richer persisted sheet model (beats stored as JSON).
 *   RelationshipLink - directed tension edge between two characters (1-10 score).
 *   LoreNote       - world-building note with markdown content + tags.
 *   HardwareTelemetry - live CPU/RAM/VRAM snapshot from Rust telemetry module.
 *   ModelStatusItem / ModelVaultStatus - GGUF catalog entries + vault state.
 *   AppSettings    - persisted user settings schema (SQLite app_settings).
 *   AppUpdateAsset / AppUpdateInfo - GitHub release metadata for updater UI.
 *   ScrapedCastMember / ScrapedMedia - IMDb scraper output (camelCase, matches
 *     src-tauri/src/scraper/imdb.rs serde structs exactly).
 */

export type MediaType = 'movie' | 'series' | 'anime' | 'book' | 'screenplay';
export type WatchStatus = 'plan_to_watch' | 'watching' | 'completed' | 'dropped';
export type RoleType = 'protagonist' | 'antagonist' | 'supporting' | 'cameo' | 'deuteragonist';
export type ArcType = 'main_quest' | 'character_arc' | 'mystery' | 'sub_plot' | 'b_story';
export type ImpactLevel = 'critical' | 'major' | 'medium' | 'minor';
export type ThemeName = 'theme-obsidian' | 'theme-crimson' | 'theme-midnight' | 'theme-emerald';
export type BeatSheetFramework = 'save-the-cat' | 'three-act' | 'dan-harmon' | 'heros-journey';

export interface Media {
  id: string;
  imdbId?: string;
  title: string;
  originalTitle?: string;
  year?: number;
  mediaType: MediaType;
  runtimeMinutes?: number;
  imdbRating?: number;
  posterUrl?: string;
  posterLocalPath?: string;
  synopsis?: string;
  genres: string[];
  directors: string[];
  rawScrapedJson?: string;
  aiSummary?: string;
  aiModelUsed?: string;
  userStatus: WatchStatus;
  /** Personal score 1-10 (user's own verdict - distinct from imdbRating). */
  userRating?: number;
  /** Free-form personal review / notes. */
  reviewNotes?: string;
  /** Favorite flag shown as a heart across the UI. */
  isFavorite?: boolean;
  /** ISO date the item was marked completed. */
  watchedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  mediaId: string;
  name: string;
  actorName?: string;
  roleType: RoleType;
  motivation?: string;
  secretBackstory?: string;
  avatarUrl?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoryArc {
  id: string;
  mediaId: string;
  parentArcId?: string;
  title: string;
  arcType: ArcType;
  description?: string;
  orderIndex: number;
  isResolved: boolean;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Beat {
  id: string;
  name: string;
  act: string;
  percentage: number;
  order: number;
  description: string;
  content: string;
  isCompleted: boolean;
}

export interface BeatItem {
  id: string;
  beatNumber: number;
  name: string;
  targetPercentage?: number;
  description: string;
  userContent: string;
  sceneHeading?: string;
  pacingTensionScore?: number; // 1-10
}

export interface BeatSheet {
  id: string;
  mediaId: string;
  framework: BeatSheetFramework;
  title: string;
  logline?: string;
  beats: BeatItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipLink {
  sourceCharacterId: string;
  targetCharacterId: string;
  relationshipType: string; // 'Allies', 'Rivals', 'Secret Betrayal', 'Unrequited Love', etc.
  tensionScore: number; // 1-10
  notes?: string;
}

export interface CharacterTensionMatrix {
  mediaId: string;
  relationships: RelationshipLink[];
}

export interface CinematographyCue {
  id: string;
  mediaId: string;
  sceneTitle: string;
  colorPalette: {
    dominant: string;
    accent: string;
    shadow: string;
  };
  lightingStyle?: string;
  lensChoice?: string;
  aspectRatio?: string;
  audioThemeNotes?: string;
}

export interface TimelineEvent {
  id: string;
  mediaId: string;
  title: string;
  chronologicalOrder: number;
  inUniverseTimestamp?: string;
  description?: string;
  impactLevel: ImpactLevel;
  involvedCharacterIds: string[];
  createdAt: string;
}

export interface LoreNote {
  id: string;
  mediaId: string;
  characterId?: string;
  arcId?: string;
  category: string;
  title: string;
  contentMarkdown: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HardwareTelemetry {
  cpuUsagePercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  gpuName?: string;
  vramUsedMb: number;
  vramTotalMb: number;
  isVramCritical: boolean; // Warning triggered if approaching 2GB
  activeOffloadMode: 'gpu_auto' | 'cpu_only';
  gpuLayersOffloaded: number;
  totalGpuLayers: number;
}

export interface ModelStatusItem {
  id: string;
  name: string;
  parameterSize: string;
  quantization: string;
  fileSizeMb: number;
  description: string;
  filename: string;
  isInstalled: boolean;
  isActive: boolean;
  localPath?: string;
  downloadUrl: string;
  sha256: string;
}

export interface ModelVaultStatus {
  vaultPath: string;
  activeModelId: string;
  models: ModelStatusItem[];
}

export interface AppSettings {
  theme: ThemeName;
  defaultWorkspaceMode: 'cinephile' | 'director';
  modelVaultPath: string;
  activeModelId: string;
  inferenceMode: 'gpu_auto' | 'cpu_only';
  temperature: number;
  topP: number;
  contextWindow: number;
  scraperDelayMs: number;
  posterResolution: 'uhd' | '1080p' | '720p';
  autoBackupInterval: 'daily' | 'weekly' | 'exit' | 'disabled';
  telemetryRefreshMs: number;
  sidebarAutoCollapse: boolean;
  uiScaling: number;
}

export interface AppUpdateAsset {
  name: string;
  size: number;
  browserDownloadUrl: string;
}

export interface AppUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseTitle: string;
  releaseNotes: string;
  publishedAt: string;
  releaseUrl: string;
  assets: AppUpdateAsset[];
}

/**
 * One cast member extracted from IMDb.
 * Field names MUST stay identical to src-tauri/src/scraper/imdb.rs
 * `ScrapedCastMember` (serde rename_all = "camelCase").
 */
export interface ScrapedCastMember {
  name: string;
  characterName: string | null;
  avatarUrl: string | null;
}

/**
 * Metadata returned by the `extract_imdb` Tauri command.
 * Field names MUST stay identical to src-tauri/src/scraper/imdb.rs
 * `ScrapedMedia` (serde rename_all = "camelCase"). Optional fields are
 * genuinely optional - the UI must render "unknown" instead of inventing values.
 */
export interface ScrapedMedia {
  imdbId: string;
  title: string;
  originalTitle: string | null;
  year: number | null;
  mediaType: string;
  runtimeMinutes: number | null;
  imdbRating: number | null;
  posterUrl: string | null;
  /** Backend-cached local copy of the poster (asset-protocol path), when download succeeded. */
  posterLocalPath: string | null;
  synopsis: string | null;
  genres: string[];
  directors: string[];
  castMembers: ScrapedCastMember[];
}


