/**
 * deck/MediaDetailModal.tsx
 * ─────────────────────────────────────────────────────────────
 * WHAT: Detail modal for one media entry: HERO BAND (blurred poster backdrop
 *       + scrim + sharp poster/meta row), a visible Overview/AI Breakdown
 *       segmented tab bar, editable watch-status dropdown, synopsis,
 *       Director's Suite shortcut, and the Local AI Narrative Analysis panel
 *       (generation progress, offline-model guidance, retry, persisted
 *       summary).
 *
 * TABS: `activeSubTab` auto-selects on open/generate (see useEffect +
 *       handleGenerateAI) AND is user-switchable via aria-pressed buttons -
 *       the flip logic stays, but the state is now visible and manual.
 *
 * PERSISTENCE FLOW: every mutation here (status change / AI summary) saves via
 *       `api.saveMedia` FIRST, then reports the updated entity through
 *       `onMediaUpdated` so App.tsx can refresh selectedMedia + mediaList.
 *       This is what makes regenerated summaries survive close/reopen.
 *
 * USES:    services/api.ts, hooks/useAISummary.ts, types/index.ts,
 *          common/{Modal,Button,Markdown}.tsx, utils/poster.ts, index.css
 *          (.glass-panel, .cv-border-glow).
 * USED BY: App.tsx.
 */
import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Markdown } from '../common/Markdown';
import { Media, WatchStatus } from '../../types';
import { useAISummary } from '../../hooks/useAISummary';
import { api } from '../../services/api';
import { getPosterSrc } from '../../utils/poster';
import { toast } from '../common/Toast';
import {
  Star,
  Clock,
  Sparkles,
  Compass,
  AlertTriangle,
  WifiOff,
  RefreshCw,
  Film,
  Tv,
  BookOpen,
  MonitorPlay,
  Loader2,
  Heart,
  Trash2,
} from 'lucide-react';

interface MediaDetailModalProps {
  /** Entity being inspected; null renders nothing. */
  media: Media | null;
  /** Modal visibility flag. */
  isOpen: boolean;
  /** Close request. */
  onClose: () => void;
  /** Jump to Director's Suite for this title. */
  onOpenDirectorSuite: (media: Media) => void;
  /** Called AFTER persisting any update so the owner can refresh state. */
  onMediaUpdated?: (updated: Media) => void;
  /** Called AFTER a confirmed backend deletion (id already removed). */
  onMediaDeleted?: (mediaId: string) => void;
}

/** All watch statuses offered by the dropdown, in display order. */
const STATUS_OPTIONS: Array<{ value: WatchStatus; label: string }> = [
  { value: 'plan_to_watch', label: 'Plan to Watch' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Watched' },
  { value: 'dropped', label: 'Dropped' },
];

/** Sub-tabs rendered in the segmented control between hero band and AI panel. */
const SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'ai-breakdown', label: 'AI Breakdown' },
] as const;

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  media,
  isOpen,
  onClose,
  onOpenDirectorSuite,
  onMediaUpdated,
  onMediaDeleted,
}) => {
  const {
    isGenerating,
    summary,
    setSummary,
    modelUsed,
    generateSummary,
    error,
    downloadProgress,
    downloadSpeed,
    downloadAttempt,
    clearError,
  } = useAISummary({
    onSuccess: async (generatedText) => {
      if (!media) return;
      const updated = { ...media, aiSummary: generatedText, updatedAt: new Date().toISOString() };
      try {
        await api.saveMedia(updated);
        onMediaUpdated?.(updated);
      } catch (e) {
        console.warn('Could not persist updated AI summary to database:', e);
      }
    },
  });

  /** Which section is visible inside the AI panel area. */
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'ai-breakdown'>('overview');
  /** True while a status change is being persisted. */
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  // Reset/sync local state whenever opened or switched to a different entry.
  useEffect(() => {
    if (media) {
      setSummary(media.aiSummary || '');
      clearError();
      setActiveSubTab(media.aiSummary ? 'ai-breakdown' : 'overview');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.id]);

  if (!media) return null;

  /** Kick off (or regenerate) the local AI narrative analysis. */
  const handleGenerateAI = async () => {
    setActiveSubTab('ai-breakdown');
    clearError();
    await generateSummary({
      prompt: `Analyze the thematic layers, character arcs, and cinematic subtext for "${media.title}".`,
      title: media.title,
      genres: media.genres,
      synopsis: media.synopsis,
      mediaType: media.mediaType,
    });
  };

  /** Persist a watch-status change and mirror it upward.
      Marking completed also stamps watchedDate (once). */
  const handleStatusChange = async (nextStatus: WatchStatus) => {
    if (isSavingStatus || nextStatus === media.userStatus) return;
    setIsSavingStatus(true);
    try {
      const updated: Media = {
        ...media,
        userStatus: nextStatus,
        // Stamp the completion date the first time a title is marked watched.
        watchedDate:
          nextStatus === 'completed' ? (media.watchedDate ?? new Date().toISOString()) : media.watchedDate,
        updatedAt: new Date().toISOString(),
      };
      await api.saveMedia(updated);
      onMediaUpdated?.(updated);
    } catch (err) {
      console.error('[Status Change Error]', err);
    } finally {
      setIsSavingStatus(false);
    }
  };

  /** Generic personal-metadata saver (rating / favorite / review notes).
      Applies the change optimistically FIRST so rapid successive edits always
      build on the newest state; a failed save rolls back to `base`. */
  const handleUpdateFields = async (patch: Partial<Media>) => {
    const base = media;
    const updated: Media = { ...base, ...patch, updatedAt: new Date().toISOString() };
    onMediaUpdated?.(updated);
    try {
      await api.saveMedia(updated);
    } catch (err) {
      console.error('[Personal Metadata Save Error]', err);
      onMediaUpdated?.(base);
    }
  };

  /** Permanently delete this entry after explicit confirmation. */
  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete "${media.title}" from your vault? This cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteMedia(media.id);
      onMediaDeleted?.(media.id);
    } catch (err) {
      console.error('[Delete Media Error]', err);
      toast.error(err instanceof Error ? err.message : String(err), 'Delete failed');
    }
  };

  /** Icon + human label for every MediaType union value. */
  const typeInfo = (() => {
    switch (media.mediaType) {
      case 'series':
        return { icon: <Tv size={12} />, label: 'Series' };
      case 'anime':
        return { icon: <MonitorPlay size={12} />, label: 'Anime' };
      case 'book':
        return { icon: <BookOpen size={12} />, label: 'Book' };
      case 'screenplay':
        return { icon: <Film size={12} />, label: 'Screenplay' };
      default:
        return { icon: <Film size={12} />, label: 'Feature Film' };
    }
  })();

  /** Poster source: local cached file first, remote URL fallback. */
  const posterSrc = getPosterSrc(media);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={media.title}
      subtitle={`${media.year ? `${media.year} • ` : ''}${typeInfo.label.toUpperCase()} • ${media.genres.join(', ')}`}
      maxWidth="720px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* HERO BAND - blurred poster backdrop + scrim, sharp content on top */}
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            ...(posterSrc ? {} : { backgroundColor: 'var(--bg-raised)' }),
          }}
        >
          {posterSrc && (
            <img
              src={posterSrc}
              alt=""
              aria-hidden
              style={{
                position: 'absolute',
                inset: '-40px',
                width: 'calc(100% + 80px)',
                height: 'calc(100% + 80px)',
                objectFit: 'cover',
                filter: 'blur(28px) saturate(1.3)',
                opacity: 0.35,
                transform: 'scale(1.1)',
              }}
            />
          )}
          {posterSrc && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.15) 0%, var(--bg-secondary) 92%)',
              }}
            />
          )}

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {posterSrc && (
              <img
                src={posterSrc}
                alt={media.title}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                style={{
                  width: '130px',
                  height: '190px',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  boxShadow: 'var(--shadow-3)',
                  flexShrink: 0,
                }}
              />
            )}

          <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
            <div>
              {/* Meta Row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {typeInfo.icon}
                  {typeInfo.label}
                </span>

                {typeof media.imdbRating === 'number' && (
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

              {/* Genre Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
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

              {/* Scrollable Synopsis Box */}
              <div
                style={{
                  maxHeight: '90px',
                  overflowY: 'auto',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.55,
                  scrollbarWidth: 'thin',
                  userSelect: 'text',
                }}
              >
                {media.synopsis || 'No synopsis recorded for this entry.'}
              </div>
            </div>

            {/* Action Bar - status editor, personal rating, favorite, actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={media.userStatus}
                onChange={(e) => handleStatusChange(e.target.value as WatchStatus)}
                disabled={isSavingStatus}
                aria-label="Watch status"
                style={{
                  padding: '7px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Personal rating (1-10) */}
              <select
                value={media.userRating ?? ''}
                onChange={(e) =>
                  handleUpdateFields({ userRating: e.target.value ? Number(e.target.value) : undefined })
                }
                aria-label="Your rating out of ten"
                title="Your personal rating (1-10)"
                style={{
                  padding: '7px 6px',
                  backgroundColor: media.userRating ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: media.userRating ? 'var(--accent)' : 'var(--text-primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <option value="">Rate</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    ★ {n}/10
                  </option>
                ))}
              </select>

              {/* Favorite toggle */}
              <button
                type="button"
                onClick={() => handleUpdateFields({ isFavorite: !media.isFavorite })}
                aria-pressed={Boolean(media.isFavorite)}
                aria-label={media.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                title={media.isFavorite ? 'Favorited' : 'Add to favorites'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '30px',
                  backgroundColor: media.isFavorite ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                  border: `1px solid ${media.isFavorite ? 'var(--status-danger)' : 'var(--border-medium)'}`,
                  borderRadius: 'var(--radius-sm)',
                  color: media.isFavorite ? 'var(--status-danger)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <Heart size={14} fill={media.isFavorite ? 'currentColor' : 'none'} />
              </button>

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

              {/* Destructive zone - pushed to the end of the action bar */}
              <button
                type="button"
                onClick={handleDelete}
                aria-label={`Delete ${media.title} permanently`}
                title="Delete from vault"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginLeft: 'auto',
                  padding: '7px 10px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--status-danger)';
                  e.currentTarget.style.borderColor = 'var(--status-danger)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border-medium)';
                }}
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>

            {/* Personal Review Notes - saved on blur */}
            <div>
              <label className="cv-kicker" style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Your Review & Notes
              </label>
              <textarea
                rows={2}
                defaultValue={media.reviewNotes ?? ''}
                key={`review_${media.id}`}
                onBlur={(e) => {
                  const next = e.target.value;
                  if (next !== (media.reviewNotes ?? '')) handleUpdateFields({ reviewNotes: next });
                }}
                placeholder="Private thoughts, hot takes, rewatch notes..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-sans)',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
          </div>
        </div>

        {/* Sub-tab segmented control - makes activeSubTab visible & manual */}
        <div role="group" aria-label="Detail sections" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {SUB_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              aria-pressed={activeSubTab === tab.id}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                background: activeSubTab === tab.id ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
                color: activeSubTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: activeSubTab === tab.id ? '1px solid var(--accent)' : '1px solid transparent',
                transition: 'all var(--transition-fast)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* AI Synthesis Section */}
        {activeSubTab === 'ai-breakdown' && (
          <div
            className="glass-panel cv-border-glow"
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              userSelect: 'text',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--accent)' }}>
              <Sparkles size={16} />
              <strong style={{ fontSize: '13px' }}>Embedded Local AI Synthesis (&lt; 2GB VRAM)</strong>
              {summary && !isGenerating && (
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {modelUsed}
                </span>
              )}
            </div>

            {/* Download Progress Telemetry (First-Use Auto-Download) */}
            {downloadProgress !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px', padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-primary)', flexWrap: 'wrap', gap: '6px' }}>
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
                role="alert"
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
                role="alert"
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
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                Generating structured narrative breakdown...
              </div>
            ) : summary ? (
              <Markdown
                source={summary}
                style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}
              />
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
};
