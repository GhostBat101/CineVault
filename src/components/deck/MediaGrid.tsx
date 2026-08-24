/**
 * deck/MediaGrid.tsx
 * ─────────────────────────────────────────────────────────────
 * WHAT: Dashboard catalog view. Filters/sorts the media list, renders the
 *       responsive poster-card grid and every non-ready state: loading
 *       skeletons, load-error panel with retry, and three distinct
 *       empty-state messages (no titles vs no search hits vs no filter hits).
 *       Cards are wrapped in .stagger-item divs for a fade-rise entrance;
 *       status pills use the quiet-active recipe (accent-subtle + accent).
 *
 * USES:    types/index.ts, deck/MediaCard.tsx, index.css (.stagger-item,
 *          .cv-skeleton).
 * USED BY: App.tsx.
 *
 * PROPS:
 *   mediaList          - full catalog from useMediaLibrary.
 *   isLoading          - true while the backend fetch is in flight -> skeleton.
 *   loadError          - fetch failure message; renders error panel when set.
 *   onRetryLoad        - re-trigger the catalog fetch.
 *   onSelectMedia      - open detail modal for a card.
 *   onOpenDirectorSuite- jump to Director's Suite for a card.
 *   onOpenIngest       - open ingest modal (empty-state CTA).
 *   searchQuery        - live Navbar search text.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Media, WatchStatus } from '../../types';
import { MediaCard } from './MediaCard';
import { Filter, ArrowUpDown, Film } from 'lucide-react';

interface MediaGridProps {
  mediaList: Media[];
  isLoading: boolean;
  loadError: string | null;
  onRetryLoad: () => void;
  onSelectMedia: (media: Media) => void;
  onOpenDirectorSuite: (media: Media) => void;
  /** Persist a cycled watch status from a card pill. */
  onStatusChange: (media: Media, nextStatus: WatchStatus) => void;
  onOpenIngest: () => void;
  searchQuery: string;
}

/** Stable identity for the status-filter tab list. Uses the REAL WatchStatus values.
 *  'favorites' is a virtual tab (matches isFavorite, not userStatus). */
const STATUS_TABS = [
  { id: 'all', label: 'All Media' },
  { id: 'favorites', label: '♥ Favorites' },
  { id: 'plan_to_watch', label: 'Plan to Watch' },
  { id: 'watching', label: 'Watching' },
  { id: 'completed', label: 'Watched' },
  { id: 'dropped', label: 'Dropped' },
] as const;

/** Sort keys - 'your_rating_desc' and 'watched_desc' sort on personal metadata. */
type SortKey = 'date_desc' | 'rating_desc' | 'your_rating_desc' | 'watched_desc' | 'year_desc' | 'title_asc';

/** Stable style so memo(MediaCard) isn't defeated by a fresh object per render.
 *  Makes each card fill its .stagger-item wrapper (which the grid stretches). */
const CARD_FILL_STYLE: React.CSSProperties = { height: '100%' };

export const MediaGrid: React.FC<MediaGridProps> = ({
  mediaList,
  isLoading,
  loadError,
  onRetryLoad,
  onSelectMedia,
  onOpenDirectorSuite,
  onStatusChange,
  onOpenIngest,
  searchQuery,
}) => {
  /** Active status tab id ('all' | 'favorites' | a WatchStatus value). */
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  /** Genre filter ('all' or one genre string). */
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  /** Sort key applied after filtering. */
  const [sortBy, setSortBy] = useState<SortKey>('date_desc');

  // Extract all unique genres across the catalog for the genre dropdown.
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    mediaList.forEach((m) => m.genres.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [mediaList]);

  // Filter by status/genre/search, then sort a copy (never mutate props).
  const filteredMedia = useMemo(() => {
    return mediaList
      .filter((m) => {
        // Status / favorites filter
        if (selectedStatus === 'favorites') {
          if (!m.isFavorite) return false;
        } else if (selectedStatus !== 'all' && m.userStatus !== selectedStatus) {
          return false;
        }
        // Genre filter
        if (selectedGenre !== 'all' && !m.genres.includes(selectedGenre)) return false;
        // Search query matches title, director, OR genre
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = m.title.toLowerCase().includes(q);
          const matchDirector = m.directors.some((d) => d.toLowerCase().includes(q));
          const matchGenre = m.genres.some((g) => g.toLowerCase().includes(q));
          if (!matchTitle && !matchDirector && !matchGenre) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'rating_desc':
            return (b.imdbRating || 0) - (a.imdbRating || 0);
          case 'your_rating_desc':
            return (b.userRating || 0) - (a.userRating || 0);
          case 'watched_desc': {
            // Invalid/absent dates must compare as 0 - NaN would break
            // strict-weak-ordering and scramble the whole sorted array.
            const aTime = Number.isNaN(new Date(a.watchedDate || 0).getTime())
              ? 0
              : new Date(a.watchedDate || 0).getTime();
            const bTime = Number.isNaN(new Date(b.watchedDate || 0).getTime())
              ? 0
              : new Date(b.watchedDate || 0).getTime();
            return bTime - aTime;
          }
          case 'year_desc':
            return (b.year || 0) - (a.year || 0);
          case 'title_asc':
            return a.title.localeCompare(b.title);
          default: {
            // date_desc: invalid/absent createdAt must compare as 0 - NaN
            // would break strict-weak-ordering and scramble the whole array.
            // Equal timestamps tie-break alphabetically for a stable order.
            const aTime = Number.isNaN(new Date(a.createdAt).getTime())
              ? 0
              : new Date(a.createdAt).getTime();
            const bTime = Number.isNaN(new Date(b.createdAt).getTime())
              ? 0
              : new Date(b.createdAt).getTime();
            return bTime - aTime || a.title.localeCompare(b.title);
          }
        }
      });
  }, [mediaList, selectedStatus, selectedGenre, searchQuery, sortBy]);

  // ── Stable callbacks (keep memo(MediaCard) effective across re-renders) ──
  const handleSelect = useCallback(
    (media: Media) => {
      onSelectMedia(media);
    },
    [onSelectMedia]
  );
  const handleDirectorSuite = useCallback(
    (media: Media) => {
      onOpenDirectorSuite(media);
    },
    [onOpenDirectorSuite]
  );
  const handleStatusChange = useCallback(
    (media: Media, nextStatus: WatchStatus) => {
      onStatusChange(media, nextStatus);
    },
    [onStatusChange]
  );

  // True when filters/search hide everything even though the vault has titles.
  const isFilteredEmpty =
    !isLoading &&
    !loadError &&
    filteredMedia.length === 0 &&
    mediaList.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Filter and Control Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Status Filter Tabs */}
        <div role="tablist" aria-label="Filter by watch status" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              aria-pressed={selectedStatus === tab.id}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                // Quiet-active recipe: subtle fill + accent text/border.
                background: selectedStatus === tab.id ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                color: selectedStatus === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: selectedStatus === tab.id ? '1px solid var(--accent)' : '1px solid transparent',
                transition: 'all var(--transition-fast)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls: Genre Filter & Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Genre Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              aria-label="Filter by genre"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Genres</option>
              {allGenres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpDown size={14} color="var(--text-muted)" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort catalog"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              <option value="date_desc">Recently Added</option>
              <option value="your_rating_desc">Your Rating</option>
              <option value="watched_desc">Recently Watched</option>
              <option value="rating_desc">Highest IMDb</option>
              <option value="year_desc">Release Year</option>
              <option value="title_asc">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* LOAD ERROR PANEL - distinct from empty state so failures are visible */}
      {loadError && !isLoading && (
        <div
          role="alert"
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--status-danger)',
          }}
        >
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: 'var(--status-danger)' }}>
            Could not load your vault
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>{loadError}</p>
          <button
            onClick={onRetryLoad}
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* LOADING SKELETONS - shown instead of a misleading "empty vault" */}
      {isLoading && (
        <div
          aria-busy="true"
          aria-label="Loading media library"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '20px',
          }}
        >
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={`skeleton_${index}`}
              style={{
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Poster-shaped shimmer block (2:3 aspect like real posters) */}
              <div
                className="cv-skeleton"
                style={{
                  width: '100%',
                  aspectRatio: '2/3',
                }}
              />
              <div style={{ padding: '12px' }}>
                <div style={{ height: '12px', width: '80%', marginBottom: '8px', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--bg-tertiary)' }} />
                <div style={{ height: '10px', width: '50%', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--bg-tertiary)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MEDIA GRID */}
      {!isLoading && !loadError && filteredMedia.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredMedia.map((media, index) => (
            <div
              key={media.id}
              className="stagger-item"
              style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
            >
              <MediaCard
                media={media}
                onClick={handleSelect}
                onOpenDirectorSuite={handleDirectorSuite}
                onStatusChange={handleStatusChange}
                style={CARD_FILL_STYLE}
              />
            </div>
          ))}
        </div>
      )}

      {/* EMPTY STATES - copy distinguishes vault-empty vs search vs filter */}
      {!isLoading && !loadError && filteredMedia.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 20px',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-medium)',
          }}
        >
          <Film size={40} strokeWidth={1.5} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>
            {isFilteredEmpty ? 'No matches in your vault' : 'No media found'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            {searchQuery.trim()
              ? `Nothing matches "${searchQuery.trim()}". Try adjusting your search terms.`
              : isFilteredEmpty
                ? 'Titles exist but none match the current status/genre filters.'
                : 'Your vault is currently empty.'}
          </p>
          {isFilteredEmpty ? (
            <button
              onClick={() => {
                setSelectedStatus('all');
                setSelectedGenre('all');
              }}
              style={{
                padding: '8px 20px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Clear Filters
            </button>
          ) : (
            <button
              onClick={onOpenIngest}
              style={{
                padding: '8px 20px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent)',
                color: 'var(--bg-primary)',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              + Add Your First Title
            </button>
          )}
        </div>
      )}
    </div>
  );
};
