/**
 * utils/poster.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: Resolves poster image sources with a FALLBACK CHAIN: locally cached
 *       file first (populated by the backend at ingest), then the remote CDN
 *       URL, then nothing (caller renders an icon). Consumers drive the chain
 *       with an onError handler that advances to the next candidate - this is
 *       what makes posters survive any single failing leg (asset-protocol
 *       hiccups, CDN hotlink blocks, offline).
 *
 * ASSET PROTOCOL: Local paths are exposed through Tauri's asset protocol via
 *   convertFileSrc(); the scope in tauri.conf.json covers the cache/posters
 *   directory. A failing asset URL simply advances the chain.
 *
 * USES:    @tauri-apps/api/core (convertFileSrc).
 * USED BY: components/deck/{MediaCard,MediaDetailModal,IngestModal}.tsx.
 */
import { convertFileSrc } from '@tauri-apps/api/core';

/** Minimal shape needed to resolve posters (subset of Media / ScrapedMedia). */
interface PosterSource {
  /** Backend-cached local file path, when the poster was downloaded. */
  posterLocalPath?: string | null;
  /** Remote CDN URL from the scraper. */
  posterUrl?: string | null;
}

/**
 * Ordered poster candidates, best (offline-capable) first. Duplicates and
 * empties removed so consumers can blindly walk the list on error.
 */
export function getPosterCandidates(media: PosterSource | null | undefined): string[] {
  if (!media) return [];
  const candidates: string[] = [];
  if (media.posterLocalPath) {
    candidates.push(convertFileSrc(media.posterLocalPath));
  }
  if (media.posterUrl) {
    candidates.push(media.posterUrl);
  }
  return [...new Set(candidates)];
}

/**
 * Single best poster source (first candidate), for callers that do not
 * implement the full chain.
 */
export function getPosterSrc(media: PosterSource | null | undefined): string | undefined {
  return getPosterCandidates(media)[0];
}

