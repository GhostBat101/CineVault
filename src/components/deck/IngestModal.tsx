/**
 * File Purpose: Media ingestion modal supporting IMDb metadata extraction and blank original screenplay canvas initialization.
 * Communication Matrix: Rendered in App.tsx; queries api.extractImdb, api.saveMedia, and api.importPosterAsset.
 */

import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { api, isTauri } from '../../services/api';
import { getPosterSrc, getPosterCandidates } from '../../utils/poster';
import { Media, MediaType } from '../../types';
import { Sparkles, Globe, PenTool, CheckCircle, ImagePlus, AlertTriangle } from 'lucide-react';

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaSaved: (media: Media) => void;
}

function mapScrapedMediaType(raw: string | undefined): MediaType {
  const value = (raw || '').toLowerCase();
  if (value.includes('series') || value.includes('episode') || value.includes('tv')) {
    return 'series';
  }
  return 'movie';
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  onMediaSaved,
}) => {
  const [tab, setTab] = useState<'imdb' | 'original'>('imdb');
  const [imdbUrl, setImdbUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrapedData, setScrapedData] = useState<Media | null>(null);

  const [originalTitle, setOriginalTitle] = useState('');
  const [originalType, setOriginalType] = useState<MediaType>('movie');
  const [originalSynopsis, setOriginalSynopsis] = useState('');
  const [originalGenres, setOriginalGenres] = useState('Drama, Thriller');
  const [originalPosterLocalPath, setOriginalPosterLocalPath] = useState<string | undefined>(undefined);
  const [isPickingPoster, setIsPickingPoster] = useState(false);

  const switchTab = (next: 'imdb' | 'original') => {
    setError(null);
    setTab(next);
  };

  const handleChoosePoster = async () => {
    if (!isTauri() || isPickingPoster) return;
    setIsPickingPoster(true);
    setError(null);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      });
      if (typeof picked === 'string') {
        const cachedPath = await api.importPosterAsset(picked);
        setOriginalPosterLocalPath(cachedPath);
      }
    } catch (err) {
      console.error('[Poster Import Error]', err);
      setError(err instanceof Error ? err.message : String(err) || 'Failed to import poster image.');
    } finally {
      setIsPickingPoster(false);
    }
  };

  const handleExtractImdb = async () => {
    if (!imdbUrl.trim()) return;
    setIsExtracting(true);
    setError(null);
    try {
      const scraped = await api.extractImdb(imdbUrl);
      const mediaEntry: Media = {
        id: `mv_${crypto.randomUUID()}`,
        imdbId: scraped.imdbId,
        title: scraped.title,
        originalTitle: scraped.originalTitle ?? undefined,
        year: scraped.year ?? undefined,
        mediaType: mapScrapedMediaType(scraped.mediaType),
        runtimeMinutes: scraped.runtimeMinutes ?? undefined,
        imdbRating: scraped.imdbRating ?? undefined,
        posterUrl: scraped.posterUrl ?? undefined,
        posterLocalPath: scraped.posterLocalPath ?? undefined,
        synopsis: scraped.synopsis ?? undefined,
        genres: [...new Set(scraped.genres.map((g) => g.trim()).filter(Boolean))],
        directors: [...new Set(scraped.directors.map((d) => d.trim()).filter(Boolean))],
        userStatus: 'plan_to_watch',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setScrapedData(mediaEntry);
    } catch (err) {
      console.error('[IMDb Extract Error]', err);
      setError(
        err instanceof Error
          ? err.message
          : String(err) || 'Failed to extract IMDb metadata. Check URL.'
      );
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveToVault = async () => {
    if (!scrapedData) return;
    setIsSaving(true);
    try {
      await api.saveMedia(scrapedData);
      onMediaSaved(scrapedData);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || 'Failed to save media entry.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOriginal = async () => {
    if (!originalTitle.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date();
      const originalEntry: Media = {
        id: `orig_${crypto.randomUUID()}`,
        title: originalTitle.trim(),
        mediaType: originalType,
        year: now.getFullYear(),
        synopsis: originalSynopsis.trim() || undefined,
        genres: [...new Set(originalGenres.split(',').map((g) => g.trim()).filter(Boolean))],
        directors: ['Original Creator'],
        posterLocalPath: originalPosterLocalPath || undefined,
        userStatus: 'plan_to_watch',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await api.saveMedia(originalEntry);
      onMediaSaved(originalEntry);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || 'Failed to save original canvas.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setScrapedData(null);
    setImdbUrl('');
    setError(null);
    setTab('imdb');
    setOriginalTitle('');
    setOriginalSynopsis('');
    setOriginalGenres('Drama, Thriller');
    setOriginalPosterLocalPath(undefined);
    onClose();
  };

  const renderUnknown = () => <span style={{ opacity: 0.5 }}>unknown</span>;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Ingest Media & Narrative Canvas"
      subtitle="Extract from online databases or begin an original screenwriting project"
      maxWidth="580px"
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px',
        }}
      >
        <button
          onClick={() => switchTab('imdb')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: tab === 'imdb' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: tab === 'imdb' ? 'var(--bg-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <Globe size={14} />
          <span>IMDb Scraper</span>
        </button>

        <button
          onClick={() => switchTab('original')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: tab === 'original' ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: tab === 'original' ? 'var(--bg-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <PenTool size={14} />
          <span>Original Screenplay</span>
        </button>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--status-danger)',
            fontSize: '12px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {tab === 'imdb' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              IMDb Title URL or ID
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={imdbUrl}
                onChange={(e) => setImdbUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && imdbUrl.trim() && !isExtracting) handleExtractImdb();
                }}
                placeholder="https://www.imdb.com/title/tt1375666/ or tt1375666"
                style={{
                  flex: 1,
                  minWidth: '180px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              />
              <Button
                variant="primary"
                onClick={handleExtractImdb}
                isLoading={isExtracting}
                disabled={!imdbUrl.trim()}
                icon={<Sparkles size={14} />}
              >
                Extract
              </Button>
            </div>
          </div>

          {scrapedData && (
            <div
              className="glass-panel"
              style={{
                display: 'flex',
                gap: '16px',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-medium)',
                flexWrap: 'wrap',
              }}
            >
              {getPosterSrc(scrapedData) && (
                <img
                  src={getPosterSrc(scrapedData)}
                  alt={scrapedData.title}
                  onError={(e) => {
                    const candidates = getPosterCandidates(scrapedData);
                    const current = e.currentTarget.src;
                    const next = candidates.find((c) => c !== current && !current.endsWith(c));
                    if (next) {
                      e.currentTarget.src = next;
                    } else {
                      e.currentTarget.style.display = 'none';
                    }
                  }}
                  style={{ width: '80px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {scrapedData.title} {scrapedData.year ? `(${scrapedData.year})` : ''}
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0' }}>
                    <span>★ {typeof scrapedData.imdbRating === 'number' ? scrapedData.imdbRating.toFixed(1) : renderUnknown()}</span>
                    <span>•</span>
                    <span>{scrapedData.runtimeMinutes ? `${scrapedData.runtimeMinutes} min` : renderUnknown()}</span>
                    <span>•</span>
                    <span>{scrapedData.genres.length > 0 ? scrapedData.genres.join(', ') : 'No genres listed'}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {scrapedData.synopsis || 'No synopsis extracted.'}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveToVault}
                  isLoading={isSaving}
                  icon={<CheckCircle size={14} />}
                  style={{ alignSelf: 'flex-start', marginTop: '10px' }}
                >
                  Save to Local Vault
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'original' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Project Title
            </label>
            <input
              type="text"
              value={originalTitle}
              onChange={(e) => setOriginalTitle(e.target.value)}
              placeholder="e.g. Cyberpunk Noir Project"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Format
              </label>
              <select
                value={originalType}
                onChange={(e) => setOriginalType(e.target.value as MediaType)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                <option value="movie">Feature Film</option>
                <option value="series">TV Pilot / Limited Series</option>
                <option value="screenplay">Screenplay</option>
                <option value="book">Novel / Lore Document</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Genres (comma separated)
              </label>
              <input
                type="text"
                value={originalGenres}
                onChange={(e) => setOriginalGenres(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Poster (optional)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleChoosePoster}
                isLoading={isPickingPoster}
                icon={<ImagePlus size={14} />}
              >
                Choose Poster Image...
              </Button>
              {originalPosterLocalPath && getPosterSrc({ posterLocalPath: originalPosterLocalPath }) && (
                <>
                  <img
                    src={getPosterSrc({ posterLocalPath: originalPosterLocalPath })}
                    alt="Selected poster preview"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    style={{
                      width: '48px',
                      height: '72px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {originalPosterLocalPath.split(/[\\/]/).pop()}
                  </span>
                </>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Logline & Core Premise
            </label>
            <textarea
              rows={3}
              value={originalSynopsis}
              onChange={(e) => setOriginalSynopsis(e.target.value)}
              placeholder="When a disgraced detective uncovers a forbidden memory chip..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                resize: 'vertical',
              }}
            />
          </div>

          <Button
            variant="primary"
            onClick={handleSaveOriginal}
            isLoading={isSaving}
            disabled={!originalTitle.trim()}
          >
            Create Narrative Canvas
          </Button>
        </div>
      )}
    </Modal>
  );
};
