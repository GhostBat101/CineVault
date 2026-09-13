/**
 * File Purpose: Director Suite workspace shell orchestrating sub-tab navigation between beats, character matrix, lore notes, and cinematography cues.
 * Communication Matrix: Rendered in App.tsx; imports BeatSheetView, TensionMatrixView, LoreNotesView, CinematographyCuesView.
 */

import React, { useState } from 'react';
import { Media } from '../../types';
import { BeatSheetView } from './BeatSheetView';
import { TensionMatrixView } from './TensionMatrixView';
import { LoreNotesView } from './LoreNotesView';
import { CinematographyCuesView } from './CinematographyCuesView';
import { ListTree, Users, BookOpen, Camera, Clapperboard } from 'lucide-react';

interface DirectorSuiteProps {
  media: Media | null;
  mediaList?: Media[];
  onSelectMedia?: (media: Media) => void;
}

const SUB_TABS = [
  { id: 'beats', label: 'Beat Sheet Engine', icon: ListTree },
  { id: 'tension-matrix', label: 'Character Tension Matrix', icon: Users },
  { id: 'lore-notes', label: 'Lore & Continuity Audits', icon: BookOpen },
  { id: 'cinematography', label: 'Cinematography Cues', icon: Camera },
] as const;

type SubTabId = (typeof SUB_TABS)[number]['id'];

function setActiveTabSafe(
  setter: React.Dispatch<React.SetStateAction<SubTabId>>,
  id: SubTabId
): void {
  setter(id);
}

export const DirectorSuite: React.FC<DirectorSuiteProps> = ({
  media,
  mediaList = [],
  onSelectMedia,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('beats');
  const mediaKey = media?.id ?? 'no-title';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
        <div role="tablist" aria-label="Director's Suite sections" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTabSafe(setActiveSubTab, tab.id)}
                aria-pressed={isActive}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: isActive ? 'var(--accent)' : 'var(--bg-tertiary)',
                  color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

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
            aria-label="Active directing title"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-xs)',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              maxWidth: '220px',
              textOverflow: 'ellipsis',
            }}
          >
            <option value="">{media ? '-- Switch Title --' : '-- Select a Title to Direct --'}</option>
            {mediaList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} {m.year ? `(${m.year})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mediaList.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border-medium)',
          }}
        >
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            No Titles to Direct Yet
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            Ingest a movie or series from IMDb first - then its beats, characters, and lore become editable here.
          </p>
        </div>
      ) : (
        <>
          {activeSubTab === 'beats' && <BeatSheetView key={`beats_${mediaKey}`} media={media} />}
          {activeSubTab === 'tension-matrix' && <TensionMatrixView key={`matrix_${mediaKey}`} media={media} />}
          {activeSubTab === 'lore-notes' && <LoreNotesView key={`lore_${mediaKey}`} media={media} />}
          {activeSubTab === 'cinematography' && <CinematographyCuesView key={`cinema_${mediaKey}`} media={media} />}
        </>
      )}
    </div>
  );
};
