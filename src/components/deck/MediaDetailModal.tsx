import { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Media } from '../../types';
import { useAISummary } from '../../hooks/useAISummary';
import { Star, Clock, Sparkles, Compass, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';

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
  const {
    isGenerating,
    summary,
    generateSummary,
    error,
    downloadProgress,
    downloadSpeed,
    downloadAttempt,
    clearError,
  } = useAISummary();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'ai-breakdown'>('overview');

  if (!media) return null;

  const handleGenerateAI = () => {
    setActiveSubTab('ai-breakdown');
    clearError();
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--accent)' }}>
              <Sparkles size={16} />
              <strong style={{ fontSize: '13px' }}>Embedded Local AI Synthesis (&lt; 2GB VRAM)</strong>
            </div>

            {/* Download Progress Telemetry (First-Use Auto-Download) */}
            {downloadProgress !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-primary)' }}>
                  <span>
                    Downloading Default Model (Llama 3.2 1B)
                    {downloadAttempt ? ` • Attempt ${downloadAttempt.attempt}/${downloadAttempt.max}` : ''}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{downloadProgress}% ({downloadSpeed} MB/s)</span>
                </div>
                <div
                  style={{
                    height: '6px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-full)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${downloadProgress}%`,
                      height: '100%',
                      backgroundColor: 'var(--accent)',
                      transition: 'width 0.2s linear',
                    }}
                  />
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  First-use initialization: Streaming GGUF weights directly into your portable models folder...
                </span>
              </div>
            )}

            {/* Offline Notification Alert */}
            {error && error.includes('OFFLINE_NO_INTERNET') ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: 'var(--status-warning)',
                  fontSize: '12px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  lineHeight: 1.5,
                }}
              >
                <WifiOff size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>No Internet Connection Detected:</strong> The default local model (Llama 3.2 1B, 808 MB) has not been downloaded yet. Please connect to the internet to download it, or mount a local .GGUF file in the Model Vault.
                </div>
              </div>
            ) : error ? (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: 'var(--status-error)',
                  fontSize: '12px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start',
                  lineHeight: 1.5,
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>AI Analysis Error:</strong> {error}
                  <div style={{ marginTop: '8px' }}>
                    <button
                      onClick={handleGenerateAI}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-medium)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <RefreshCw size={12} /> Retry Now
                    </button>
                  </div>
                </div>
              </div>
            ) : isGenerating && downloadProgress === null ? (
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
