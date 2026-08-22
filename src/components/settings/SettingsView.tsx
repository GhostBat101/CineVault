/**
 * settings/SettingsView.tsx
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * WHAT: Settings suite: theme picker, Local AI inference preferences
 *       (temperature / GPU offload - persisted to SQLite), data export &
 *       import, developer links, and the GitHub-release updater UI with live
 *       install progress.
 *
 * PERSISTENCE: AI settings load once from `get_app_settings` and every change
 *       is debounce-saved through `save_app_settings`. Tabs whose features are
 *       not implemented yet say so honestly instead of claiming auto-save.
 *
 * USES:    services/api.ts (settings + updates), types/index.ts,
 *          common/Button.tsx, common/Toast.tsx (toast singleton),
 *          version.json.
 * USED BY: App.tsx.
 */
import React, { useState } from 'react';
import { ThemeName, AppSettings } from '../../types';
import { Button } from '../common/Button';
import { api } from '../../services/api';
import {
  Palette,
  Cpu,
  Globe,
  Compass,
  HardDrive,
  Database,
  Code2,
  CheckCircle,
  Download,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

import { AppUpdateInfo } from '../../types';
import versionData from '../../../version.json';
import { isTauri } from '../../services/api';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { toast } from '../common/Toast';

interface SettingsViewProps {
  /** Currently active theme name. */
  currentTheme: ThemeName;
  /** Switch the global theme (owned by App/useTheme). */
  onThemeChange: (theme: ThemeName) => void;
}

/** Debounce window (ms) for persisting slider-driven setting changes. */
const SETTINGS_SAVE_DEBOUNCE_MS = 400;

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentTheme,
  onThemeChange,
}) => {
  /** Below this width the left nav collapses to a 56px icon rail. */
  const isCompactNav = useMediaQuery('(max-width: 720px)');
  const [activeTab, setActiveTab] = useState<
    'general' | 'ai' | 'scraper' | 'director' | 'storage' | 'data' | 'developer' | 'updates'
  >('general');

  // AI settings - hydrated from SQLite on mount, debounce-persisted on change
  /** Generation temperature fed into every inference request. */
  const [temperature, setTemperature] = useState<number>(0.7);
  /** GPU layer offload strategy ('gpu_auto' | 'cpu_only'). */
  const [offloadMode, setOffloadMode] = useState<string>('gpu_auto');
  /** Pending save timer ref for debounced persistence. */
  const saveTimerRef = React.useRef<number | null>(null);

  // Hydrate persisted settings once on mount.
  React.useEffect(() => {
    let cancelled = false;
    api
      .getAppSettings()
      .then((settings: AppSettings | null) => {
        if (cancelled || !settings) return;
        if (typeof settings.temperature === 'number') setTemperature(settings.temperature);
        if (settings.inferenceMode) setOffloadMode(settings.inferenceMode);
      })
      .catch((err) => console.warn('[Settings Load]', err));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Pending patch accumulated across rapid changes; flushed on debounce OR unmount. */
  const pendingPatchRef = React.useRef<Partial<AppSettings>>({});

  /**
   * Debounce-persist a partial settings patch to SQLite. Sliders fire many
   * change events; patches MERGE into the pending set and the last flush
   * within the window hits the backend once (backend also merges server-side).
   */
  const persistAiSettings = (patch: Partial<AppSettings>) => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    const timer = window.setTimeout(() => {
      const toSave = pendingPatchRef.current;
      pendingPatchRef.current = {};
      if (Object.keys(toSave).length === 0) return;
      api.saveAppSettings(toSave).catch((err) => console.warn('[Settings Save]', err));
    }, SETTINGS_SAVE_DEBOUNCE_MS);
    saveTimerRef.current = timer;
  };

  /** Immediately send any patch still waiting on the debounce timer. */
  const flushPendingSettings = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const toSave = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(toSave).length === 0) return;
    api.saveAppSettings(toSave).catch((err) => console.warn('[Settings Flush]', err));
  };

  // App Update Checker State
  /** Latest GitHub release info (null until first check). */
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  /** True while the release check request is in flight. */
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  /** Last update-check/install error message. */
  const [updateError, setUpdateError] = useState<string | null>(null);

  // App Installer Live Streaming State
  /** True while the installer downloads (button spinner). */
  const [isInstallingUpdate, setIsInstallingUpdate] = useState<boolean>(false);
  /** Installer download percentage 0-100. */
  const [installProgress, setInstallProgress] = useState<number>(0);
  /** Installer download speed string (MB/s). */
  const [installSpeed, setInstallSpeed] = useState<string>('0.0');
  /** Human status line under the install progress bar. */
  const [installStatusText, setInstallStatusText] = useState<string>('Downloading installer...');

  // Installer download progress events (disposed-flag guards the listen race)
  React.useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isTauri()) {
      import('@tauri-apps/api/event')
        .then(({ listen }) =>
          listen<any>('app_update_progress', (event) => {
            if (disposed) return;
            const p = event.payload;
            if (p) {
              setInstallProgress(Math.round(p.percentage || 0));
              setInstallSpeed((p.speedMbps || 0).toFixed(1));
              if (p.isCompleted) {
                setInstallStatusText('Launching installer & updating CineVault...');
              }
            }
          })
        )
        .then((unsub) => {
          if (disposed) {
            unsub();
            return;
          }
          unlisten = unsub;
        })
        .catch((err) => console.warn('Could not bind update listener:', err));
    }
    return () => {
      disposed = true;
      if (unlisten) unlisten();
      // FLUSH (not discard) any debounced patch so a slider nudge followed
      // immediately by tab-switch is never lost.
      flushPendingSettings();
    };
  }, []);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    try {
      const info = await api.checkForUpdates();
      setUpdateInfo(info);
    } catch (err: any) {
      console.error('[Update Check Error]', err);
      setUpdateError(err?.message || 'Failed to check GitHub releases.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo) return;
    const exeAsset = (updateInfo.assets || []).find((a) => a.name && a.name.toLowerCase().endsWith('.exe'));
    const downloadUrl = exeAsset ? exeAsset.browserDownloadUrl : `${updateInfo.releaseUrl}`;
    const filename = exeAsset ? exeAsset.name : `CineVault_${updateInfo.latestVersion}_Setup.exe`;

    if (!exeAsset) {
      // Fallback: open release page in browser
      window.open(updateInfo.releaseUrl, '_blank');
      return;
    }

    setIsInstallingUpdate(true);
    setInstallProgress(0);
    setInstallSpeed('0.0');
    setInstallStatusText('Connecting to GitHub Release CDN...');
    setUpdateError(null);

    try {
      await api.downloadAndInstallUpdate(downloadUrl, filename);
      // Success normally ends with the backend exiting the process to hand
      // over to the installer; reaching here means it returned without exit.
      setInstallStatusText('Installer launched - CineVault will close to complete setup.');
    } catch (err: any) {
      console.error('[Install Update Error]', err);
      setUpdateError(err?.message || 'Failed to download or launch update installer.');
    } finally {
      // Never leave the button spinning if the backend returns without exit.
      setIsInstallingUpdate(false);
    }
  };

  // Status message
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleExportDatabase = async () => {
    try {
      const jsonContent = await api.exportDatabaseJson();
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cinevault_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Database exported to JSON with integrity checksum.');
    } catch (err) {
      // Non-blocking toast instead of alert(): export failures surface
      // without freezing the UI thread.
      const errMessage = err instanceof Error ? err.message : String(err);
      toast.error(errMessage, 'Export failed');
    }
  };

  const handleImportDatabase = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      try {
        // File read INSIDE the guard - permission/IO failures must surface
        // as a toast, not an unhandled rejection.
        const text = await file.text();
        await api.importDatabaseJson(text);
        showStatus('Database restored successfully! Reloading...');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err), 'Import failed');
      }
    };
    input.click();
  };

  /** Escape one RFC-4180 CSV cell: quote-wrapped, doubled inner quotes. */
  const csvCell = (value: string | number | undefined): string => {
    const raw = value === undefined || value === null ? '' : String(value);
    return `"${raw.replace(/"/g, '""')}"`;
  };

  /**
   * Export the vault as CSV (spreadsheet / Letterboxd-import friendly):
   * Title, Year, Directors, your Rating, Watched date, Review notes.
   */
  const handleExportCsv = async () => {
    try {
      const media = await api.getAllMedia();
      const header = 'Title,Year,Directors,YourRating,WatchedDate,Review';
      const lines = media.map((m) =>
        [
          csvCell(m.title),
          csvCell(m.year ?? ''),
          csvCell(m.directors.join('; ')),
          csvCell(m.userRating ?? ''),
          csvCell(m.watchedDate ? m.watchedDate.slice(0, 10) : ''),
          csvCell((m.reviewNotes ?? '').replace(/\r?\n/g, ' ')),
        ].join(',')
      );
      // UTF-8 BOM: without it Excel on Windows mangles non-ASCII titles.
      const csv = `\uFEFF${header}\n${lines.join('\n')}\n`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cinevault_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus(`Exported ${media.length} titles to CSV.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), 'CSV export failed');
    }
  };

  const tabs = [
    { id: 'general', label: 'General & Theme', icon: Palette },
    { id: 'ai', label: 'Local AI & VRAM', icon: Cpu },
    { id: 'scraper', label: 'IMDb Ingestion', icon: Globe },
    { id: 'director', label: "Director's Suite", icon: Compass },
    { id: 'storage', label: 'Storage & Cache', icon: HardDrive },
    { id: 'data', label: 'Data & Portability', icon: Database },
    { id: 'developer', label: 'Developer & SDK', icon: Code2 },
    { id: 'updates', label: 'Updates & Releases', icon: RefreshCw },
  ] as const;

  return (
    <div style={{ display: 'flex', gap: isCompactNav ? '16px' : '24px', minHeight: '520px', minWidth: 0 }}>
      {/* Left Vertical Sub-Nav (Linear Style) - icon rail when narrow */}
      <div
        style={{
          width: isCompactNav ? '56px' : '210px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          borderRight: '1px solid var(--border-subtle)',
          paddingRight: isCompactNav ? '8px' : '16px',
          flexShrink: 0,
          alignItems: isCompactNav ? 'center' : 'stretch',
        }}
      >
        {!isCompactNav && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, padding: '0 8px 8px 8px', textTransform: 'uppercase' }}>
            Settings Categories
          </div>
        )}
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              aria-current={isActive ? 'true' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCompactNav ? 'center' : 'flex-start',
                width: isCompactNav ? '40px' : undefined,
                gap: '10px',
                padding: isCompactNav ? '9px 0' : '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: isActive ? 'var(--accent-subtle)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
            >
              <Icon size={16} />
              {!isCompactNav && <span>{tab.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Right Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {statusMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid var(--status-success)',
              color: 'var(--status-success)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle size={15} />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* TAB 1: General & Theme */}
        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Appearance & Themes</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Pure CSS Token luxury dark theme palette with zero runtime styling overhead.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              {[
                { id: 'theme-obsidian', name: 'Obsidian Dark', color: '#090a0f', accent: '#6366f1' },
                { id: 'theme-crimson', name: 'Crimson Noir', color: '#0f080a', accent: '#f43f5e' },
                { id: 'theme-midnight', name: 'Midnight Slate', color: '#0b0f19', accent: '#38bdf8' },
                { id: 'theme-emerald', name: 'Cyber Emerald', color: '#06100c', accent: '#10b981' },
              ].map((th) => (
                <div
                  key={th.id}
                  onClick={() => onThemeChange(th.id as ThemeName)}
                  className="glass-panel"
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: th.color,
                    border: `2px solid ${currentTheme === th.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>{th.name}</span>
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: th.accent }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                    {currentTheme === th.id ? 'âœ“ Currently Active' : 'Click to activate'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: AI & VRAM */}
        {activeTab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Local AI Inference & VRAM Enforcer</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Hardware guardrails enforcing &lt; 2.0 GB VRAM limit with dynamic layer offloading.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '16px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Generation Temperature</label>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setTemperature(value);
                    persistAiSettings({ temperature: value });
                  }}
                  aria-label="Generation temperature"
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  GPU Layer Offload Strategy
                </label>
                <select
                  value={offloadMode}
                  onChange={(e) => {
                    const mode = e.target.value;
                    setOffloadMode(mode);
                    // inferenceMode is the persisted field name for this control
                    persistAiSettings({ inferenceMode: mode === 'cpu_only' ? 'cpu_only' : 'gpu_auto' });
                  }}
                  aria-label="GPU layer offload strategy"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    width: '100%',
                  }}
                >
                  <option value="gpu_auto">GPU Auto (Max Safe Layers under 2GB VRAM)</option>
                  <option value="cpu_only">CPU / RAM Only (Zero VRAM Allocation)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Data & Portability */}
        {activeTab === 'data' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Relational Data Portability</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Lossless JSON database export and transactional restoration with SHA-256 integrity checks.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Export Relational Vault</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Download a single, self-contained JSON backup containing all media, characters, beat sheets, and tension matrices.
                  </p>
                </div>
                <Button variant="primary" size="sm" icon={<Download size={14} />} onClick={handleExportDatabase}>
                  Export Backup (JSON)
                </Button>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Export Spreadsheet (CSV)</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Flat catalog export with your ratings, watched dates, and reviews - opens in Excel or imports into Letterboxd-style trackers.
                  </p>
                </div>
                <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={handleExportCsv}>
                  Export Catalog (CSV)
                </Button>
              </div>

              <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Import & Restore</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Restore an existing backup JSON file. All records will be validated against schema checksums.
                  </p>
                </div>
                <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={handleImportDatabase}>
                  Restore from JSON
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: Developer & SDK */}
        {activeTab === 'developer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Developer SDK & Open Source Ecosystem</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Published packages, GitHub Releases, and Model Context Protocol (MCP) tooling.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>GitHub Packages NPM Registry</div>
                <div
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--accent)',
                    marginTop: '6px',
                  }}
                >
                  npm install @ghostbat101/cinevault-sdk
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <a
                  href="https://github.com/GhostBat101/CineVault/releases"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: 'var(--accent)',
                    textDecoration: 'none',
                  }}
                >
                  <span>View GitHub Releases</span>
                  <ExternalLink size={13} />
                </a>

                <a
                  href="https://github.com/GhostBat101/CineVault/packages"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: 'var(--accent)',
                    textDecoration: 'none',
                  }}
                >
                  <span>View GitHub Packages</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* 8. Updates & Releases Tab (On-Demand GitHub Release Checker) */}
        {activeTab === 'updates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Updates & Release Management</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Check the official public repository for updates on demand. CineVault will never update silently in the background.
              </p>
            </div>

            {/* Current Installed Version Card */}
            <div
              className="glass-panel"
              style={{
                padding: '16px 20px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Installed Application Version</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  v{versionData.version} <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>(Build {versionData.build})</span>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                icon={<RefreshCw size={14} />}
                onClick={handleCheckUpdates}
                isLoading={isCheckingUpdate}
              >
                Check for Updates
              </Button>
            </div>

            {/* Error Banner */}
            {updateError && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: 'var(--status-error)',
                  fontSize: '12px',
                }}
              >
                <strong>Update Check Failed:</strong> {updateError}
              </div>
            )}

            {/* Update Info Display */}
            {updateInfo && !isCheckingUpdate && (
              <div
                className="glass-panel"
                style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: updateInfo.hasUpdate ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                  border: `1px solid ${updateInfo.hasUpdate ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {updateInfo.hasUpdate ? (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: 'var(--status-error)',
                          border: '1px solid var(--status-error)',
                        }}
                      >
                        NEW UPDATE AVAILABLE
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: 'var(--status-success)',
                          border: '1px solid var(--status-success)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CheckCircle size={12} /> UP TO DATE
                      </span>
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>
                      Latest: v{updateInfo.latestVersion}
                    </span>
                  </div>

                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Published: {updateInfo.publishedAt ? new Date(updateInfo.publishedAt).toLocaleDateString() : '—'}
                  </span>
                </div>

                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {updateInfo.releaseTitle}
                  </h4>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-primary)',
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                      maxHeight: '180px',
                      overflowY: 'auto',
                    }}
                  >
                    {updateInfo.releaseNotes}
                  </div>
                </div>

                {/* Live Download & Install Progress Bar */}
                {isInstallingUpdate && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: '14px',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--accent)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-primary)' }}>
                      <span>{installStatusText}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{installProgress}% ({installSpeed} MB/s)</span>
                    </div>
                    <div
                      style={{
                        height: '8px',
                        backgroundColor: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${installProgress}%`,
                          height: '100%',
                          backgroundColor: 'var(--accent)',
                          transition: 'width 0.2s linear',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Streaming setup executable directly from GitHub Release CDN. CineVault will restart to complete the setup.
                    </span>
                  </div>
                )}

                {/* Release Download & Action Links */}
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {updateInfo.hasUpdate ? (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Download size={14} />}
                      onClick={handleInstallUpdate}
                      isLoading={isInstallingUpdate}
                    >
                      Download & Install Update
                    </Button>
                  ) : null}

                  <button
                    onClick={() => window.open(updateInfo.releaseUrl, '_blank')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-medium)',
                      fontWeight: 600,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <ExternalLink size={12} />
                    <span>View on GitHub</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs whose backing features are not implemented yet - honest copy */}
        {(activeTab === 'scraper' || activeTab === 'director' || activeTab === 'storage') && (
          <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{tabs.find((t) => t.id === activeTab)?.label}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              This settings section is planned for an upcoming release and has no configurable options yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
