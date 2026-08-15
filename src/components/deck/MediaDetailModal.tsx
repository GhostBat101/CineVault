import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Media } from '../../types';
import { useAISummary } from '../../hooks/useAISummary';
import { Star, Clock, Sparkles, Compass } from 'lucide-react';

interface MediaDetailModalProps {
  media: Media | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenDirectorSuite: (media: Media) => void;
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  media,
  isOpen,
  onClose,
  onOpenDirectorSuite,
}) => {
  const { isGenerating, summary, generateSummary } = useAISummary();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'ai-breakdown'>('overview');

  if (!media) return null;

  const handleGenerateAI = () => {
    setActiveSubTab('ai-breakdown');
    generateSummary(
      `Analyze the thematic layers, character arcs, and cinematic subtext for "${media.title}". Synopsis: ${media.synopsis}`
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={media.title}
      subtitle={`${media.year ? `${media.year} • ` : ''}${media.mediaType.toUpperCase()} • ${media.genres.join(', ')}`}
      maxWidth="720px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Top Header Card */}
        <div style={{ display: 'flex', gap: '20px' }}>
          {media.posterUrl && (
            <img
              src={media.posterUrl}
              alt={media.title}
              style={{
                width: '120px',
                height: '180px',
                objectFit: 'cover',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
              }}
            />
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                {media.imdbRating && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#fbbf24',
                      fontWeight: 700,
                      fontSize: '14px',
                    }}
                  >
                    <Star size={16} fill="#fbbf24" />
                    <span>{media.imdbRating.toFixed(1)} IMDb</span>
                  </div>
                )}
                {media.runtimeMinutes && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <Clock size={14} />
                    <span>{media.runtimeMinutes} min</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                {media.genres.map((g) => (
                  <span
                    key={g}
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {g}
                  </span>
                ))}
              </div>

              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {media.synopsis}
              </p>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <Button
                variant="primary"
                size="sm"
                icon={<Compass size={14} />}
                onClick={() => {
                  onOpenDirectorSuite(media);
                  onClose();
                }}
              >
                Director's Suite
              </Button>

              <Button
                variant="secondary"
                size="sm"
                icon={<Sparkles size={14} />}
                onClick={handleGenerateAI}
                isLoading={isGenerating}
              >
                {summary ? 'Regenerate Analysis' : 'Local AI Narrative Analysis'}
              </Button>
            </div>
          </div>
        </div>

        {/* AI Synthesis Section */}
        {activeSubTab === 'ai-breakdown' && (
          <div
            className="glass-panel"
            style={{
              padding: '16px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--accent)' }}>
              <Sparkles size={16} />
              <strong style={{ fontSize: '13px' }}>Embedded Local AI Synthesis (&lt; 2GB VRAM)</strong>
            </div>

            {isGenerating ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                Generating structured narrative breakdown...
              </div>
            ) : summary ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                {summary}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
};
