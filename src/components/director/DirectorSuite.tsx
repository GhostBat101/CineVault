import React, { useState } from 'react';
import { Media } from '../../types';
import { BeatSheetView } from './BeatSheetView';
import { TensionMatrixView } from './TensionMatrixView';
import { LoreNotesView } from './LoreNotesView';
import { ListTree, Users, BookOpen } from 'lucide-react';

interface DirectorSuiteProps {
  media: Media | null;
}

export const DirectorSuite: React.FC<DirectorSuiteProps> = ({
  media,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'beats' | 'tension-matrix' | 'lore-notes'>('beats');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '8px' }}>
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

        <div style={{ padding: '0 16px', borderLeft: '1px solid var(--border-medium)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Currently Directing:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {media ? media.title : 'Global Sandbox (No Title Selected)'}
            </strong>
          </span>
        </div>
      </div>

      {/* Active Sub-view Rendering */}
      {activeSubTab === 'beats' && <BeatSheetView media={media} />}
      {activeSubTab === 'tension-matrix' && <TensionMatrixView media={media} />}
      {activeSubTab === 'lore-notes' && <LoreNotesView media={media} />}
    </div>
  );
};
