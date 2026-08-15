import React, { useEffect } from 'react';
import { Film, Compass, Cpu, Settings, ChevronLeft, ChevronRight, PlusCircle } from 'lucide-react';

interface SidebarProps {
  activeTab: 'dashboard' | 'director' | 'model-vault' | 'settings';
  onSelectTab: (tab: 'dashboard' | 'director' | 'model-vault' | 'settings') => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenIngest: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  onOpenIngest,
}) => {
  // Global Keyboard Shortcuts (Ctrl+B, Ctrl+1, Ctrl+2, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'b') {
          e.preventDefault();
          onToggleCollapse();
        } else if (e.key === '1') {
          e.preventDefault();
          onSelectTab('dashboard');
        } else if (e.key === '2') {
          e.preventDefault();
          onSelectTab('director');
        } else if (e.key === '3') {
          e.preventDefault();
          onSelectTab('model-vault');
        } else if (e.key === ',') {
          e.preventDefault();
          onSelectTab('settings');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleCollapse, onSelectTab]);

  const navItems = [
    { id: 'dashboard', label: 'Media Library', icon: Film, shortcut: 'Ctrl+1' },
    { id: 'director', label: "Director's Suite", icon: Compass, shortcut: 'Ctrl+2' },
    { id: 'model-vault', label: 'Model Vault', icon: Cpu, shortcut: 'Ctrl+3' },
    { id: 'settings', label: 'Settings', icon: Settings, shortcut: 'Ctrl+,' },
  ] as const;

  return (
    <aside
      style={{
        width: isCollapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width-expanded)',
        transition: 'width var(--transition-normal)',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '12px 8px',
        overflow: 'hidden',
        userSelect: 'none',
        zIndex: 40,
      }}
    >
      {/* Top Action & Navigation Links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Quick Ingest Button */}
        <button
          onClick={onOpenIngest}
          title={isCollapsed ? 'New Ingest Entry (Ctrl+N)' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: isCollapsed ? '10px 0' : '10px 14px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: 'var(--bg-primary)',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            transition: 'all var(--transition-fast)',
            marginBottom: '8px',
          }}
        >
          <PlusCircle size={18} />
          {!isCollapsed && <span>New Entry</span>}
        </button>

        {/* Nav Links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? `${item.label} (${item.shortcut})` : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: isCollapsed ? '10px 0' : '9px 12px',
                  justifyContent: isCollapsed ? 'center' : 'space-between',
                  borderRadius: 'var(--radius-sm)',
                  background: isActive ? 'var(--accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} />
                  {!isCollapsed && <span>{item.label}</span>}
                </div>
                {!isCollapsed && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Collapse Toggle Footer */}
      <button
        onClick={onToggleCollapse}
        title={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 10px',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          fontSize: '12px',
          transition: 'all var(--transition-fast)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!isCollapsed && <span>Collapse Sidebar</span>}
        </div>
        {!isCollapsed && (
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>Ctrl+B</span>
        )}
      </button>
    </aside>
  );
};
