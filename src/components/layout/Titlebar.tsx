/**
 * layout/Titlebar.tsx
 * ─────────────────────────────────────────────────────────────
 * WHAT: Custom frameless-window title bar: brand + version chip, center
 *       tagline (hidden when narrow), theme switcher, and native window
 *       controls (minimize / maximize / close via Tauri commands).
 *       The header carries `data-tauri-drag-region` so the whole strip drags
 *       the window; interactive children opt out implicitly as real controls.
 *
 * COMPACT MODE: below 640px viewport width the tagline is hidden and both
 *       side clusters get flexShrink:0 so nothing ever wraps out of the fixed
 *       38px bar (the historical overflow bug at min window width).
 *
 * USES:    services/api.ts (window commands), types/index.ts,
 *          hooks/useMediaQuery.ts.
 * USED BY: App.tsx.
 */
import React from 'react';
import { ThemeName } from '../../types';
import { api } from '../../services/api';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface TitlebarProps {
  /** Active theme name (mirrors body class). */
  theme: ThemeName;
  /** Request a global theme change. */
  onThemeChange: (theme: ThemeName) => void;
  /** Version string rendered in the brand chip (e.g. "v0.3.21"). */
  version: string;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  theme,
  onThemeChange,
  version,
}) => {
  /** Below this width the tagline hides and clusters stop shrinking. */
  const isCompact = useMediaQuery('(max-width: 640px)');

  /** Minimize via native Tauri command; failures are non-fatal. */
  const handleMinimize = async () => {
    try {
      await api.minimizeWindow();
    } catch (e) {
      console.warn('Could not minimize window:', e);
    }
  };

  /** Toggle maximize/snap state via native Tauri command. */
  const handleMaximize = async () => {
    try {
      await api.maximizeWindow();
    } catch (e) {
      console.warn('Could not maximize window:', e);
    }
  };

  /** Graceful close request routed through the backend. */
  const handleClose = async () => {
    try {
      await api.closeWindow();
    } catch (e) {
      console.warn('Could not close window:', e);
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
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Brand & App Title - never shrinks */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none', flexShrink: 0 }}>
        <span style={{ fontSize: '15px' }}>🎬</span>
        <span style={{ fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
          CineVault
        </span>
        {!isCompact && (
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
        )}
      </div>

      {/* Center Tagline - hidden entirely in compact mode; ellipsis otherwise */}
      {!isCompact && (
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '12px',
            pointerEvents: 'none',
            flex: '1 1 0',
            minWidth: 0,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          AI-Powered Narrative & Media Tracker
        </div>
      )}

      {/* Controls Right - never shrinks */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isCompact ? '4px' : '8px',
          flexShrink: 0,
        }}
      >
        {/* Theme Switcher */}
        <select
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as ThemeName)}
          aria-label="Application theme"
          title="Theme"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <option value="theme-obsidian">Obsidian</option>
          <option value="theme-crimson">Crimson</option>
          <option value="theme-midnight">Midnight</option>
          <option value="theme-emerald">Emerald</option>
        </select>

        {/* Window Chrome Buttons */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleMinimize}
            aria-label="Minimize window"
            title="Minimize"
            className="titlebar-chrome-btn"
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
            type="button"
            onClick={handleMaximize}
            aria-label="Maximize or restore window"
            title="Maximize / Snap"
            className="titlebar-chrome-btn"
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
            type="button"
            onClick={handleClose}
            aria-label="Close window"
            title="Close"
            className="titlebar-chrome-btn titlebar-close-btn"
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
            ✕
          </button>
        </div>
      </div>
    </header>
  );
};
