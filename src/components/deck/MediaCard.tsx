/**
 * deck/MediaCard.tsx
 * ------------------------------------------------------------
 * WHAT: Single poster card in the dashboard grid. Shows poster (with offline
 *       fallback tile + bottom scrim), rating pill, watch-status pill (CLICK
 *       TO CYCLE), title/year/runtime meta, and a Director's Suite shortcut.
 *
 * INTERACTION NOTES:
 *   - Hover/focus lift is PURE CSS: root carries .glass-panel.cv-lift and the
 *     poster <img> carries .cv-zoom-img (see index.css). No JS mouse handlers.
 *   - The card root is a focusable button-like article. Its keydown handler
 *     IGNORES events that bubble from nested interactive children (the status
 *     pill / suite button) - this fixes Enter/Space being hijacked from them.
 *   - All callbacks arrive pre-stabilized via useCallback from MediaGrid so
 *     React.memo short-circuits unrelated re-renders. `style` must likewise
 *     be a stable reference (MediaGrid passes a module constant).
 *
 * USES:    types/index.ts, utils/poster.ts, index.css (.glass-panel, .cv-lift,
 *          .poster-scrim, .cv-zoom-img).
 * USED BY: deck/MediaGrid.tsx.
 */
import { memo, useState } from 'react';
import { Media, WatchStatus } from '../../types';
import { getPosterCandidates } from '../../utils/poster';
import { Star, Clock, Sparkles, Heart, Film } from 'lucide-react';

interface MediaCardProps {
  /** Entity rendered by this card. */
  media: Media;
  /** Open the detail modal for this media (stable callback). */
  onClick: (media: Media) => void;
  /** Jump to Director's Suite for this media (stable callback, optional). */
  onOpenDirectorSuite?: (media: Media) => void;
  /** Persist a new watch status after the user cycles the status pill. */
  onStatusChange?: (media: Media, nextStatus: WatchStatus) => void;
  /**
   * Optional inline style merged onto the card root (e.g. height:'100%' from
   * the stagger wrapper). Pass a STABLE object reference to keep memo effective.
   */
  style?: React.CSSProperties;
}

/** Cycle order used by the clickable status pill. */
const STATUS_CYCLE: WatchStatus[] = ['plan_to_watch', 'watching', 'completed', 'dropped'];

/** Semantic color token for each watch status. */
function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'var(--status-success)';
    case 'watching':
      return 'var(--status-warning)';
    case 'plan_to_watch':
      return 'var(--accent)';
    case 'dropped':
      return 'var(--status-danger)';
    default:
      return 'var(--text-muted)';
  }
}

export const MediaCard = memo<MediaCardProps>(({
  media,
  onClick,
  onOpenDirectorSuite,
  onStatusChange,
  style,
}) => {
  /**
   * Poster fallback chain: local cached file -> remote CDN URL -> icon.
   * posterStage indexes the candidate list; each img error advances it, so a
   * failing asset-protocol URL still lets the remote render (and vice versa)
   * before the icon fallback shows.
   */
  const posterCandidates = getPosterCandidates(media);
  const [posterStage, setPosterStage] = useState(0);
  const posterSrc = posterCandidates[posterStage];

  /** Next status in the cycle, for tooltip copy. */
  const nextStatus = STATUS_CYCLE[(STATUS_CYCLE.indexOf(media.userStatus) + 1) % STATUS_CYCLE.length];

  /**
   * Card-level keydown: activate ONLY when the event originates from the
   * card itself, never from a nested button (prevents keyboard hijack).
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(media);
    }
  };

  /** Cycle watch status without triggering the card's open-detail action. */
  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStatusChange) onStatusChange(media, nextStatus);
  };

  return (
    <article
      onClick={() => onClick(media)}
      tabIndex={0}
      role="button"
      aria-label={`Open details for ${media.title}`}
      onKeyDown={handleKeyDown}
      className="glass-panel cv-lift"
      style={{
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: 'var(--bg-secondary)',
        ...style,
      }}
    >
      {/* Poster Container - .poster-scrim adds the bottom readability gradient */}
      <div
        className="poster-scrim"
        style={{
          width: '100%',
          aspectRatio: '2/3',
          backgroundColor: 'var(--bg-tertiary)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={`${media.title} poster`}
            loading="lazy"
            onError={() => setPosterStage((stage) => stage + 1)}
            className="cv-zoom-img"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          // Fallback tile: every poster candidate failed (or none existed).
          // Lucide icon instead of an emoji - renders regardless of font subsets.
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <Film size={32} strokeWidth={1.5} />
          </div>
        )}

        {/* Rating Pill (zIndex 1 keeps it above the .poster-scrim gradient) */}
        {typeof media.imdbRating === 'number' && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              zIndex: 1,
              backgroundColor: 'rgba(9, 10, 15, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '3px 7px',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#fbbf24',
              fontFamily: 'var(--font-mono)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Star size={11} fill="#fbbf24" />
            <span>{media.imdbRating.toFixed(1)}</span>
          </div>
        )}

        {/* Favorite heart badge (top-left, above scrim) */}
        {media.isFavorite && (
          <div
            title="Favorited"
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              zIndex: 1,
              backgroundColor: 'rgba(9, 10, 15, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '4px 6px',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--status-danger)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
            }}
          >
            <Heart size={11} fill="currentColor" />
          </div>
        )}

        {/* Personal rating pill (bottom-right, distinct gold-free accent) */}
        {typeof media.userRating === 'number' && (
          <div
            title={`Your rating: ${media.userRating}/10`}
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              zIndex: 1,
              backgroundColor: 'rgba(9, 10, 15, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '3px 7px',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              border: '1px solid var(--border-active)',
            }}
          >
            <span>{media.userRating}</span>
            <span style={{ fontSize: '9px', opacity: 0.7 }}>YOU</span>
          </div>
        )}

        {/* Status Pill - click to cycle watch status (zIndex above scrim) */}
        {onStatusChange && (
          <button
            onClick={handleStatusClick}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Watch status: ${media.userStatus.replace('_', ' ')}. Activate to change to ${nextStatus.replace('_', ' ')}.`}
            title={`Click to mark as "${nextStatus.replace('_', ' ')}"`}
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              zIndex: 1,
              backgroundColor: 'rgba(9, 10, 15, 0.85)',
              backdropFilter: 'blur(8px)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: getStatusColor(media.userStatus),
              border: '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: getStatusColor(media.userStatus) }} />
            <span>{media.userStatus.replace('_', ' ')}</span>
          </button>
        )}
      </div>

      {/* Info Body */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, justifyContent: 'space-between' }}>
        <div>
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--text-primary)',
            }}
            title={media.title}
          >
            {media.title}
          </h3>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}
          >
            {Boolean(media.year) && <span>{media.year}</span>}
            {media.runtimeMinutes && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span>🎬</span>
                <Clock size={10} />
                <span>{media.runtimeMinutes}m</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        {onOpenDirectorSuite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDirectorSuite(media);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`Open Director Suite for ${media.title}`}
            style={{
              marginTop: '6px',
              padding: '5px 8px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Sparkles size={12} />
            <span>Director's Suite</span>
          </button>
        )}
      </div>
    </article>
  );
});

MediaCard.displayName = 'MediaCard';
