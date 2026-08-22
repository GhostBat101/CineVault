/**
 * hooks/useMediaLibrary.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: Owns the app-wide media library array. Loads the catalog from SQLite
 *       on mount and exposes pure LOCAL-STATE mutators - persistence is done
 *       by the component that owns the save action, then reported here via
 *       `prependMedia` / `updateMedia`. This split is what prevents the
 *       historical double-save bug (component saved + hook saved again).
 *
 * USES:    services/api.ts (getAllMedia), types/index.ts.
 * USED BY: App.tsx (the single instance = de-facto app store).
 *
 * RETURNED API:
 *   mediaList    - current catalog, newest-first (backend ORDER BY).
 *   isLoading    - true while the initial/refresh fetch is in flight
 *                  (drives the grid skeleton).
 *   error        - last fetch error message or null (drives error panel).
 *   refreshMedia - re-fetch from the backend.
 *   prependMedia - insert an already-persisted entry at the top of the list.
 *   updateMedia  - replace one already-persisted entry by id.
 */

import { useState, useEffect, useCallback } from 'react';
import { Media } from '../types';
import { api } from '../services/api';

export function useMediaLibrary() {
  /** The whole media catalog as returned by the backend. */
  const [mediaList, setMediaList] = useState<Media[]>([]);
  /** True between the start and end of a catalog fetch. */
  const [isLoading, setIsLoading] = useState<boolean>(true);
  /** Human-readable failure reason for the last fetch, null when healthy. */
  const [error, setError] = useState<string | null>(null);

  /** Fetch the full catalog; surfaces failures instead of swallowing them. */
  const fetchMedia = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.getAllMedia();
      setMediaList(data);
      setError(null);
    } catch (err: unknown) {
      console.error('[Media Library Fetch Error]', err);
      setError(err instanceof Error ? err.message : 'Failed to load media catalog.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load once on mount (StrictMode double-invoke in dev is harmless: same query).
  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  /**
   * Register a NEW entry that has ALREADY been persisted by its caller
   * (e.g. IngestModal after a successful save_media_entry).
   */
  const prependMedia = useCallback((media: Media) => {
    setMediaList((prev) => [media, ...prev.filter((m) => m.id !== media.id)]);
  }, []);

  /**
   * Swap in an UPDATED entry that has ALREADY been persisted by its caller
   * (e.g. MediaDetailModal after persisting a new AI summary / watch status).
   */
  const updateMedia = useCallback((updated: Media) => {
    setMediaList((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }, []);

  /** Drop an entry from local state AFTER the caller deleted it backend-side. */
  const removeMedia = useCallback((id: string) => {
    setMediaList((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return {
    mediaList,
    isLoading,
    error,
    refreshMedia: fetchMedia,
    prependMedia,
    updateMedia,
    removeMedia,
  };
}
