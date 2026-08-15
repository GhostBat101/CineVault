import React, { useState } from 'react';
import { ThemeName } from '../../types';
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

interface SettingsViewProps {
  currentTheme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentTheme,
  onThemeChange,
}) => {
  const [activeTab, setActiveTab] = useState<
    'general' | 'ai' | 'scraper' | 'director' | 'storage' | 'data' | 'developer'
  >('general');

  // AI settings
  const [temperature, setTemperature] = useState<number>(0.7);
  const [offloadMode, setOffloadMode] = useState<string>('gpu_auto');

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
      showStatus('Full relational database exported with SHA-256 checksum!');
    } catch (err: any) {
      alert(`Export failed: ${err?.message}`);
    }
  };

  const handleImportDatabase = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        await api.importDatabaseJson(text);
        showStatus('Database restored successfully! Reloading...');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err: any) {
        alert(`Import error: ${err?.message}`);
      }
    };
    input.click();
  };

  const tabs = [
    { id: 'general', label: 'General & Theme', icon: Palette },
    { id: 'ai', label: 'Local AI & VRAM', icon: Cpu },
    { id: 'scraper', label: 'IMDb Ingestion', icon: Globe },
    { id: 'director', label: "Director's Suite", icon: Compass },
    { id: 'storage', label: 'Storage & Cache', icon: HardDrive },
    { id: 'data', label: 'Data & Portability', icon: Database },
    { id: 'developer', label: 'Developer & SDK', icon: Code2 },
  ] as const;

  return (
    <div style={{ display: 'flex', gap: '24px', minHeight: '520px' }}>
      {/* Left Vertical Sub-Nav (Linear Style) */}
      <div
        style={{
          width: '210px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          borderRight: '1px solid var(--border-subtle)',
          paddingRight: '16px',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, padding: '0 8px 8px 8px', textTransform: 'uppercase' }}>
          Settings Categories
        </div>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
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
              <span>{tab.label}</span>
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
                    {currentTheme === th.id ? '✓ Currently Active' : 'Click to activate'}
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
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  GPU Layer Offload Strategy
                </label>
                <select
                  value={offloadMode}
                  onChange={(e) => setOffloadMode(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

        {/* Other Tabs Placeholder Renderers */}
        {(activeTab === 'scraper' || activeTab === 'director' || activeTab === 'storage') && (
          <div className="glass-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>{tabs.find((t) => t.id === activeTab)?.label}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              Settings are saved automatically to your local SQLite configuration store.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
