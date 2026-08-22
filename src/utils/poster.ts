/**
 * utils/poster.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: Resolves the best available <img> source for a poster, preferring the
 *       LOCALLY CACHED file (populated by the backend at ingest time) over the
 *       remote CDN URL - this is what makes posters truly offline-capable.
 *
 * ASSET PROTOCOL: Local paths are exposed to the webview through Tauri's
 *   asset protocol via convertFileSrc(); the scope configured in tauri.conf.json
 *   must cover the cache/posters directory. In a non-Tauri context
 *   convertFileSrc still returns a well-formed asset URL which will simply fail
 *   to load - callers therefore keep an onError fallback chain.
 *
 * USES:    @tauri-apps/api/core (convertFileSrc).
 * USED BY: components/deck/{MediaCard,MediaDetailModal,IngestModal}.tsx.
 */
import { convertFileSrc } from '@tauri-apps/api/core';

/** Minimal shape needed to resolve a poster (subset of Media / ScrapedMedia). */
interface PosterSource {
  /** Backend-cached local file path, when the poster was downloaded. */
  posterLocalPath?: string | null;
  /** Remote CDN URL from the scraper. */
  posterUrl?: string | null;
}

/**
 * Pick the most offline-friendly poster source.
 * Order: local cached file -> remote URL -> undefined (caller renders fallback).
 * Null-safe: a null/undefined media object simply yields undefined.
 */
export function getPosterSrc(media: PosterSource | null | undefined): string | undefined {
  if (!media) return undefined;
  if (media.posterLocalPath) {
    return convertFileSrc(media.posterLocalPath);
  }
  return media.posterUrl || undefined;
}
