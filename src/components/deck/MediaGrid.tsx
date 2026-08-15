import React, { useState, useMemo } from 'react';
import { Media } from '../../types';
import { MediaCard } from './MediaCard';
import { Filter, ArrowUpDown } from 'lucide-react';

interface MediaGridProps {
  mediaList: Media[];
  onSelectMedia: (media: Media) => void;
  onOpenDirectorSuite: (media: Media) => void;
  onOpenIngest: () => void;
  searchQuery: string;
}

export const MediaGrid: React.FC<MediaGridProps> = ({
  mediaList,
  onSelectMedia,
  onOpenDirectorSuite,
  onOpenIngest,
  searchQuery,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'rating_desc' | 'year_desc' | 'title_asc'>('date_desc');

  // Extract all unique genres
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    mediaList.forEach((m) => m.genres.forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [mediaList]);

  // Filter and sort items
  const filteredMedia = useMemo(() => {
    return mediaList
      .filter((m) => {
        // Status filter
        if (selectedStatus !== 'all' && m.userStatus !== selectedStatus) return false;
        // Genre filter
        if (selectedGenre !== 'all' && !m.genres.includes(selectedGenre)) return false;
        // Search query
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
          case 'year_desc':
            return (b.year || 0) - (a.year || 0);
          case 'title_asc':
            return a.title.localeCompare(b.title);
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
      });
  }, [mediaList, selectedStatus, selectedGenre, searchQuery, sortBy]);

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
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Media' },
            { id: 'watched', label: 'Watched' },
            { id: 'watching', label: 'Watching' },
            { id: 'plan_to_watch', label: 'Plan to Watch' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                background: selectedStatus === tab.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: selectedStatus === tab.id ? 'var(--bg-primary)' : 'var(--text-secondary)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls: Genre Filter & Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Genre Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: '12px',
                outline: 'none',
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
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="date_desc">Recently Added</option>
              <option value="rating_desc">Highest Rating</option>
              <option value="year_desc">Release Year</option>
              <option value="title_asc">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Media Grid / Empty State */}
      {filteredMedia.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredMedia.map((media) => (
            <MediaCard
              key={media.id}
              media={media}
              onClick={() => onSelectMedia(media)}
              onOpenDirectorSuite={() => onOpenDirectorSuite(media)}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 20px',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-medium)',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎬</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>No media found</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            {searchQuery ? 'Try adjusting your search terms or filter criteria.' : 'Your vault is currently empty.'}
          </p>
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
        </div>
      )}
    </div>
  );
};
