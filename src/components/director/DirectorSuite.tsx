import React, { useState } from 'react';
import { Media } from '../../types';
import { BeatSheetView } from './BeatSheetView';
import { TensionMatrixView } from './TensionMatrixView';
import { LoreNotesView } from './LoreNotesView';
import { ListTree, Users, BookOpen } from 'lucide-react';

import { Clapperboard } from 'lucide-react';

interface DirectorSuiteProps {
  media: Media | null;
  mediaList?: Media[];
  onSelectMedia?: (media: Media) => void;
}

export const DirectorSuite: React.FC<DirectorSuiteProps> = ({
  media,
  mediaList = [],
  onSelectMedia,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'beats' | 'tension-matrix' | 'lore-notes'>('beats');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-navigation Tabs & Directing Context Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveSubTab('beats')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeSubTab === 'beats' ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: activeSubTab === 'beats' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <ListTree size={16} />
            <span>Save the Cat! 15 Beats</span>
          </button>

          <button
            onClick={() => setActiveSubTab('tension-matrix')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeSubTab === 'tension-matrix' ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: activeSubTab === 'tension-matrix' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Users size={16} />
            <span>Character Tension Matrix</span>
          </button>

          <button
            onClick={() => setActiveSubTab('lore-notes')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeSubTab === 'lore-notes' ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: activeSubTab === 'lore-notes' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <BookOpen size={16} />
            <span>Lore & Continuity Audits</span>
          </button>
        </div>

        {/* Title Switcher Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 12px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <Clapperboard size={15} color="var(--accent)" />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Active Title:
          </span>
          <select
            value={media?.id || ''}
            onChange={(e) => {
              const selected = mediaList.find((m) => m.id === e.target.value);
              if (selected && onSelectMedia) {
                onSelectMedia(selected);
              }
            }}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '220px',
            }}
          >
            <option value="" disabled={!!media}>
              {media ? '-- Switch Title --' : '-- Select a Title to Direct --'}
            </option>
            {mediaList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} {m.year ? `(${m.year})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Sub-view Rendering */}
      {activeSubTab === 'beats' && <BeatSheetView media={media} />}
      {activeSubTab === 'tension-matrix' && <TensionMatrixView media={media} />}
      {activeSubTab === 'lore-notes' && <LoreNotesView media={media} />}
    </div>
  );
};
