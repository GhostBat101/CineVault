/**
 * layout/Navbar.tsx
 * ─────────────────────────────────────────────────────────────
 * WHAT: Top navigation strip inside the content area: contextual search bar
 *       (dashboard only), view breadcrumb (other tabs), catalog count badge,
 *       and the segmented Cinephile/Director mode switcher.
 *
 * COMPACT MODE: below 640px the Ctrl+K badge hides, the search container is
 *       allowed to shrink (minWidth:0) instead of crushing its input, and the
 *       mode-switcher labels collapse to icon-only buttons with tooltips.
 *
 * FOCUS CONTRACT: App.tsx may pass `searchInputRef`; the global Ctrl+K hotkey
 *       focuses this input programmatically.
 *
 * USES:    hooks/useMediaQuery.ts, lucide-react icons.
 * USED BY: App.tsx.
 */
import React from 'react';
import { Search, Clapperboard, Sparkles } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface NavbarProps {
  /** Live search text (controlled from App). */
  searchQuery: string;
  /** Search text change handler. */
  onSearchChange: (query: string) => void;
  /** Cosmetic mode badge driving the segmented control. */
  activeMode: 'cinephile' | 'director';
  /** Mode switch request. */
  onToggleMode: (mode: 'cinephile' | 'director') => void;
  /** Total titles in the vault (count badge). */
  totalMediaCount: number;
  /** Which top-level view is active (controls left side content). */
  activeTab?: 'dashboard' | 'director' | 'model-vault' | 'settings';
  /** Optional ref target for the global Ctrl+K focus shortcut. */
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  activeMode,
  onToggleMode,
  totalMediaCount,
  activeTab = 'dashboard',
  searchInputRef,
}) => {
  /** Below this width badges hide and labels collapse to icons. */
  const isCompact = useMediaQuery('(max-width: 640px)');

  return (
    <nav
      style={{
        padding: isCompact ? '8px 12px' : '12px 24px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: isCompact ? '8px' : '16px',
        userSelect: 'none',
        flexWrap: 'wrap',
      }}
    >
      {/* Search Input Bar (Dashboard only) or Contextual Breadcrumb */}
      {activeTab === 'dashboard' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            flex: '1 1 160px',
            minWidth: 0,
            maxWidth: isCompact ? 'none' : '380px',
          }}
        >
          <Search size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by title, director, or genre (Ctrl+K)"
            aria-label="Search media library"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '12px',
              width: '100%',
              minWidth: 0,
              fontFamily: 'var(--font-sans)',
            }}
          />
          {!isCompact && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--bg-primary)',
                padding: '2px 5px',
                borderRadius: 'var(--radius-xs)',
                flexShrink: 0,
              }}
            >
              Ctrl+K
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeTab === 'director' && "Director's Suite Mode"}
            {activeTab === 'model-vault' && 'Local AI Model Vault'}
            {activeTab === 'settings' && 'App Settings & Database Vault'}
          </span>
        </div>
      )}

      {/* Mode Switcher & Stats - never crushed by the flexible search field */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isCompact ? '8px' : '16px', flexShrink: 0 }}>
        {!isCompact && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Catalog:{' '}
            <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {totalMediaCount}
            </strong>{' '}
            titles
          </span>
        )}

        {/* Segmented Mode Switcher */}
        <div
          role="group"
          aria-label="Interface mode"
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-primary)',
            padding: '3px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => onToggleMode('cinephile')}
            aria-pressed={activeMode === 'cinephile'}
            title="Cinephile Deck"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: isCompact ? '4px 8px' : '4px 12px',
              borderRadius: 'var(--radius-xs)',
              border: 'none',
              background: activeMode === 'cinephile' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeMode === 'cinephile' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all var(--transition-fast)',
            }}
          >
            <Clapperboard size={14} />
            {!isCompact && <span>Cinephile Deck</span>}
          </button>

          <button
            type="button"
            onClick={() => onToggleMode('director')}
            aria-pressed={activeMode === 'director'}
            title="Director's Suite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: isCompact ? '4px 8px' : '4px 12px',
              borderRadius: 'var(--radius-xs)',
              border: 'none',
              background: activeMode === 'director' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeMode === 'director' ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              transition: 'all var(--transition-fast)',
            }}
          >
            <Sparkles size={14} />
            {!isCompact && <span>Director's Suite</span>}
          </button>
        </div>
      </div>
    </nav>
  );
};
