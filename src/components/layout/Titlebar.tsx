import React from 'react';
import { ThemeName } from '../../types';
import { isTauri } from '../../services/api';

interface TitlebarProps {
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  version: string;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  theme,
  onThemeChange,
  version,
}) => {
  const handleMinimize = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().minimize();
    }
  };

  const handleMaximize = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().toggleMaximize();
    }
  };

  const handleClose = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().close();
    }
  };

  return (
    <header
      data-tauri-drag-region
      style={{
        height: 'var(--titlebar-height)',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 16px',
        fontSize: '13px',
        fontWeight: 500,
        userSelect: 'none',
        WebkitAppRegion: 'drag',
        position: 'relative',
        zIndex: 100,
      } as React.CSSProperties}
    >
      {/* Brand & App Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
        <span style={{ fontSize: '15px' }}>🎬</span>
        <span style={{ fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
          CineVault
        </span>
        <span
          style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--accent-subtle)',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {version}
        </span>
      </div>

      {/* Center Window Title / Mode Indicator */}
      <div style={{ color: 'var(--text-muted)', fontSize: '12px', pointerEvents: 'none' }}>
        AI-Powered Narrative & Media Tracker
      </div>

      {/* Controls Right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        {/* Theme Switcher */}
        <select
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as ThemeName)}
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
          }}
        >
          <option value="theme-obsidian">Obsidian Dark</option>
          <option value="theme-crimson">Crimson Noir</option>
          <option value="theme-midnight">Midnight Slate</option>
          <option value="theme-emerald">Cyber Emerald</option>
        </select>

        {/* Window Chrome Buttons */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={handleMinimize}
            title="Minimize"
            style={{
              width: '32px',
              height: '28px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              borderRadius: 'var(--radius-xs)',
            }}
          >
            —
          </button>
          <button
            onClick={handleMaximize}
            title="Maximize / Snap"
            style={{
              width: '32px',
              height: '28px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              borderRadius: 'var(--radius-xs)',
            }}
          >
            □
          </button>
          <button
            onClick={handleClose}
            title="Close"
            style={{
              width: '32px',
              height: '28px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              borderRadius: 'var(--radius-xs)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--status-danger)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </header>
  );
};
