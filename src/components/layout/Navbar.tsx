import React from 'react';
import { Search, Clapperboard, Sparkles } from 'lucide-react';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeMode: 'cinephile' | 'director';
  onToggleMode: (mode: 'cinephile' | 'director') => void;
  totalMediaCount: number;
  activeTab?: 'dashboard' | 'director' | 'model-vault' | 'settings';
}

export const Navbar: React.FC<NavbarProps> = ({
  searchQuery,
  onSearchChange,
  activeMode,
  onToggleMode,
  totalMediaCount,
  activeTab = 'dashboard',
}) => {
  return (
    <nav
      style={{
        padding: '12px 24px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        userSelect: 'none',
      }}
    >
      {/* Search Input Bar (Shown strictly on Dashboard) or Contextual Breadcrumb */}
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
            width: '100%',
            maxWidth: '380px',
          }}
        >
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by title, director, genre, or character (Ctrl+K)..."
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '12px',
              width: '100%',
              fontFamily: 'var(--font-sans)',
            }}
          />
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              backgroundColor: 'var(--bg-primary)',
              padding: '2px 5px',
              borderRadius: 'var(--radius-xs)',
            }}
          >
            Ctrl+K
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {activeTab === 'director' && "Director's Suite Mode"}
            {activeTab === 'model-vault' && 'Local AI Model Vault'}
            {activeTab === 'settings' && 'App Settings & Database Vault'}
          </span>
        </div>
      )}

      {/* Mode Switcher & Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Total Media Count Badge */}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Catalog: <strong style={{ color: 'var(--text-primary)' }}>{totalMediaCount}</strong> titles
        </span>

        {/* Segmented Mode Switcher */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-primary)',
            padding: '3px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            onClick={() => onToggleMode('cinephile')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
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
            <span>Cinephile Deck</span>
          </button>

          <button
            onClick={() => onToggleMode('director')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
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
            <span>Director's Suite</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
