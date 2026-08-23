/**
 * director/DirectorSuite.tsx
 * ------------------------------------------------------------
 * WHAT: Shell for the Director's Suite mode: sub-tab navigation between the
 *       Beat Sheet engine, Character Tension Matrix, and Lore Notes views,
 *       plus the "Active Title" dropdown for switching the directing target.
 *
 * REMOUNT GUARANTEE: App.tsx already keys this component by media id; each
 *       sub-view below is keyed AGAIN by media id so switching titles always
 *       remounts them and reloads their own persisted state (prevents the
 *       historical cross-title data corruption in localStorage-backed views).
 *
 * USES:    types/index.ts, director/{BeatSheetView,TensionMatrixView,LoreNotesView}.tsx.
 * USED BY: App.tsx.
 */
import React, { useState } from 'react';
import { Media } from '../../types';
import { BeatSheetView } from './BeatSheetView';
import { TensionMatrixView } from './TensionMatrixView';
import { LoreNotesView } from './LoreNotesView';
import { ListTree, Users, BookOpen, Clapperboard } from 'lucide-react';

interface DirectorSuiteProps {
  /** Currently selected media entity (directing target); null = none chosen. */
  media: Media | null;
  /** Full catalog for the title switcher dropdown. */
  mediaList?: Media[];
  /** Notify parent when a different title is selected. */
  onSelectMedia?: (media: Media) => void;
}

/** Sub-tab definitions rendered data-driven (single source of truth). */
const SUB_TABS = [
  { id: 'beats', label: 'Save the Cat! 15 Beats', icon: ListTree },
  { id: 'tension-matrix', label: 'Character Tension Matrix', icon: Users },
  { id: 'lore-notes', label: 'Lore & Continuity Audits', icon: BookOpen },
] as const;

type SubTabId = (typeof SUB_TABS)[number]['id'];

export const DirectorSuite: React.FC<DirectorSuiteProps> = ({
  media,
  mediaList = [],
  onSelectMedia,
}) => {
  /** Which sub-view is currently displayed. */
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('beats');

  /** Stable identity for remount keys across title switches. */
  const mediaKey = media?.id ?? 'no-title';

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
            {/* Placeholder option: selectable only when nothing is chosen yet */}
            <option value="">{media ? '-- Switch Title --' : '-- Select a Title to Direct --'}</option>
            {mediaList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} {m.year ? `(${m.year})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty-catalog guidance: without any titles there is nothing to direct */}
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
          {/* Active Sub-view Rendering.
              key={mediaKey} forces a clean remount per title so every view's
              load-before-save persistence pattern starts from ITS OWN data. */}
          {activeSubTab === 'beats' && <BeatSheetView key={`beats_${mediaKey}`} media={media} />}
          {activeSubTab === 'tension-matrix' && <TensionMatrixView key={`matrix_${mediaKey}`} media={media} />}
          {activeSubTab === 'lore-notes' && <LoreNotesView key={`lore_${mediaKey}`} media={media} />}
        </>
      )}
    </div>
  );
};

/** Tiny helper keeping the map callback tidy while switching sub-tabs. */
function setActiveTabSafe(
  setter: React.Dispatch<React.SetStateAction<SubTabId>>,
  id: SubTabId
): void {
  setter(id);
}
