import { memo } from 'react';
import { Media } from '../../types';
import { Star, Clock, Sparkles } from 'lucide-react';

interface MediaCardProps {
  media: Media;
  onClick: () => void;
  onOpenDirectorSuite?: () => void;
}

export const MediaCard = memo<MediaCardProps>(({
  media,
  onClick,
  onOpenDirectorSuite,
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'watched': return 'var(--status-success)';
      case 'watching': return 'var(--status-warning)';
      case 'plan_to_watch': return 'var(--accent)';
      case 'dropped': return 'var(--status-danger)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <article
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label={`Open details for ${media.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="glass-panel"
      style={{
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.boxShadow = '0 12px 24px -8px rgba(0, 0, 0, 0.5)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Poster Container */}
      <div
        style={{
          width: '100%',
          aspectRatio: '2/3',
          backgroundColor: 'var(--bg-tertiary)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {media.posterUrl ? (
          <img
            src={media.posterUrl}
            alt={`${media.title} poster`}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transition: 'transform var(--transition-normal)',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              color: 'var(--text-muted)',
            }}
          >
            🎬
          </div>
        )}

        {/* Rating Pill */}
        {media.imdbRating && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
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

        {/* Status Badge */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
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
          }}
        >
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: getStatusColor(media.userStatus) }} />
          <span>{media.userStatus.replace('_', ' ')}</span>
        </div>
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
            {media.year && <span>{media.year}</span>}
            {media.runtimeMinutes && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span>•</span>
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
              onOpenDirectorSuite();
            }}
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
