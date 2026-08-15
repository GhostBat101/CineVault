// Core Data Types for CineVault

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
  userRating?: number;
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
  category: 'worldbuilding' | 'magic_system' | 'faction' | 'theory' | 'continuity' | 'general';
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
