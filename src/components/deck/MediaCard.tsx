import React from 'react';
import { Media } from '../../types';
import { Star, Clock, Sparkles } from 'lucide-react';

interface MediaCardProps {
  media: Media;
  onClick: () => void;
  onOpenDirectorSuite?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
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
    <div
      onClick={onClick}
      className="glass-panel"
      style={{
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform var(--transition-fast), border-color var(--transition-fast)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
      }}
    >
      {/* Poster Image Container */}
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
            alt={media.title}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
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

        {/* Rating Badge */}
        {media.imdbRating && (
          <div
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
            }}
          >
            <Star size={11} fill="#fbbf24" />
            <span>{media.imdbRating.toFixed(1)}</span>
          </div>
        )}

        {/* Status Indicator Chip */}
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: getStatusColor(media.userStatus),
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: getStatusColor(media.userStatus) }} />
          <span>{media.userStatus.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Info Container */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, justifyContent: 'space-between' }}>
        <div>
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
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

        {/* Quick Action Button */}
        {onOpenDirectorSuite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDirectorSuite();
            }}
            style={{
              marginTop: '6px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--accent-subtle)',
              color: 'var(--accent)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              transition: 'background var(--transition-fast)',
            }}
          >
            <Sparkles size={12} />
            <span>Open in Director Suite</span>
          </button>
        )}
      </div>
    </div>
  );
};
