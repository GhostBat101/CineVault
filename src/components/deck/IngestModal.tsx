import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { api } from '../../services/api';
import { Media, MediaType } from '../../types';
import { Sparkles, Globe, PenTool, CheckCircle } from 'lucide-react';

interface IngestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaSaved: (media: Media) => void;
}

export const IngestModal: React.FC<IngestModalProps> = ({
  isOpen,
  onClose,
  onMediaSaved,
}) => {
  const [tab, setTab] = useState<'imdb' | 'original'>('imdb');
  const [imdbUrl, setImdbUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scraped preview state
  const [scrapedData, setScrapedData] = useState<Media | null>(null);

  // Original screenplay form state
  const [originalTitle, setOriginalTitle] = useState('');
  const [originalType, setOriginalType] = useState<MediaType>('movie');
  const [originalSynopsis, setOriginalSynopsis] = useState('');
  const [originalGenres, setOriginalGenres] = useState('Drama, Thriller');

  const handleExtractImdb = async () => {
    if (!imdbUrl.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const scraped = await api.extractImdb(imdbUrl);
      const mediaEntry: Media = {
        id: `mv_${Date.now()}`,
        imdbId: scraped.imdb_id,
        title: scraped.title,
        originalTitle: scraped.original_title,
        year: scraped.year || 2024,
        mediaType: 'movie',
        runtimeMinutes: scraped.runtime_minutes || 120,
        imdbRating: scraped.imdb_rating || 8.0,
        posterUrl: scraped.poster_url,
        synopsis: scraped.synopsis || 'An exciting cinematic journey.',
        genres: scraped.genres.length > 0 ? scraped.genres : ['Drama'],
        directors: scraped.directors.length > 0 ? scraped.directors : ['Director'],
        userStatus: 'plan_to_watch',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setScrapedData(mediaEntry);
    } catch (err) {
      console.error('[IMDb Extract Error]', err);
      setError(err instanceof Error ? err.message : String(err) || 'Failed to extract IMDb metadata. Check URL.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToVault = async () => {
    if (!scrapedData) return;
    setIsLoading(true);
    try {
      await api.saveMedia(scrapedData);
      onMediaSaved(scrapedData);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || 'Failed to save media entry.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOriginal = async () => {
    if (!originalTitle.trim()) return;
    setIsLoading(true);
    try {
      const originalEntry: Media = {
        id: `orig_${Date.now()}`,
        title: originalTitle,
        mediaType: originalType,
        year: new Date().getFullYear(),
        synopsis: originalSynopsis || 'Original Screenplay Canvas',
        genres: originalGenres.split(',').map((g) => g.trim()).filter(Boolean),
        directors: ['Original Creator'],
        userStatus: 'plan_to_watch',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await api.saveMedia(originalEntry);
      onMediaSaved(originalEntry);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err) || 'Failed to save original canvas.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setScrapedData(null);
    setImdbUrl('');
    setError(null);
    setOriginalTitle('');
    setOriginalSynopsis('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Ingest Media & Narrative Canvas"
      subtitle="Extract from online databases or begin an original screenwriting project"
      maxWidth="580px"
    >
      {/* Mode Switcher Tabs */}
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
          onClick={() => setTab('imdb')}
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
          onClick={() => setTab('original')}
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
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--status-danger)',
            fontSize: '12px',
            marginBottom: '16px',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* TAB 1: IMDb Scraping Engine */}
      {tab === 'imdb' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              IMDb Title URL or ID
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={imdbUrl}
                onChange={(e) => setImdbUrl(e.target.value)}
                placeholder="https://www.imdb.com/title/tt1375666/ or tt1375666"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <Button
                variant="primary"
                onClick={handleExtractImdb}
                isLoading={isLoading}
                icon={<Sparkles size={14} />}
              >
                Extract
              </Button>
            </div>
          </div>

          {/* Scraped Result Preview */}
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
              }}
            >
              {scrapedData.posterUrl && (
                <img
                  src={scrapedData.posterUrl}
                  alt={scrapedData.title}
                  style={{ width: '80px', height: '120px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                />
              )}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {scrapedData.title} {scrapedData.year && `(${scrapedData.year})`}
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0' }}>
                    <span>★ {scrapedData.imdbRating}</span>
                    <span>•</span>
                    <span>{scrapedData.runtimeMinutes} min</span>
                    <span>•</span>
                    <span>{scrapedData.genres.join(', ')}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {scrapedData.synopsis}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveToVault}
                  isLoading={isLoading}
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

      {/* TAB 2: Original Screenplay */}
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
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                  outline: 'none',
                }}
              >
                <option value="movie">Feature Film</option>
                <option value="tv">TV Pilot / Limited Series</option>
                <option value="novel">Novel / Lore Document</option>
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
                  outline: 'none',
                }}
              />
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
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          <Button
            variant="primary"
            onClick={handleSaveOriginal}
            isLoading={isLoading}
            disabled={!originalTitle.trim()}
          >
            Create Narrative Canvas
          </Button>
        </div>
      )}
    </Modal>
  );
};
