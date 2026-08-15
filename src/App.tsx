import { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { Titlebar } from './components/layout/Titlebar';
import { Sidebar } from './components/layout/Sidebar';
import { Navbar } from './components/layout/Navbar';
import { TelemetryHUD } from './components/telemetry/TelemetryHUD';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Modal } from './components/common/Modal';
import { Button } from './components/common/Button';

export function App() {
  const { theme, setTheme } = useTheme('theme-obsidian');
  const { mediaList } = useMediaLibrary();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'director' | 'model-vault' | 'settings'>('dashboard');
  const [activeMode, setActiveMode] = useState<'cinephile' | 'director'>('cinephile');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  return (
    <div className="app-shell">
      {/* 1. Custom Frameless Desktop Titlebar */}
      <Titlebar
        theme={theme}
        onThemeChange={setTheme}
        version="v0.2.2"
      />

      {/* 2. Main Shell Layout */}
      <div className="app-body">
        {/* Collapsible Navigation Sidebar (240px <-> 68px) */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenIngest={() => setIsIngestModalOpen(true)}
        />

        {/* Content View Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header Search & Mode Switcher */}
          <Navbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeMode={activeMode}
            onToggleMode={(mode) => {
              setActiveMode(mode);
              if (mode === 'director') setActiveTab('director');
              else setActiveTab('dashboard');
            }}
            totalMediaCount={mediaList.length}
          />

          {/* Main View Container with Error Boundary */}
          <main className="main-content" style={{ padding: '24px' }}>
            <ErrorBoundary fallbackTitle="View Failed to Render">
              {activeTab === 'dashboard' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                      <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>Media & Narrative Library</h1>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        100% Offline Vault with Embedded Local AI (<span style={{ color: 'var(--accent)' }}>&lt; 2 GB VRAM</span>) & Relational Lore Tracking.
                      </p>
                    </div>
                  </div>

                  {/* Empty state & Ingest card */}
                  <div
                    className="glass-panel"
                    onClick={() => setIsIngestModalOpen(true)}
                    style={{
                      padding: '48px 24px',
                      textAlign: 'center',
                      border: '2px dashed var(--border-medium)',
                      borderRadius: 'var(--radius-lg)',
                      cursor: 'pointer',
                      maxWidth: '480px',
                      transition: 'all var(--transition-normal)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-medium)';
                    }}
                  >
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
                    <h3 style={{ fontSize: '16px', marginBottom: '6px' }}>+ Ingest New Narrative Entry</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      Extract rich metadata from an IMDb URL or start an original screenplay canvas.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'director' && (
                <div>
                  <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>Director's Pre-Production Suite</h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
                    Save the Cat! 15 Beats, Three-Act Breakdown, Dynamic Relationship Tension Matrix, and AI Continuity Audits.
                  </p>
                </div>
              )}

              {activeTab === 'model-vault' && (
                <div>
                  <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>Local AI Model Vault</h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
                    Manage installed GGUF models, directory storage routing, and hardware offload allocations.
                  </p>
                </div>
              )}

              {activeTab === 'settings' && (
                <div>
                  <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>Settings & Preferences</h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '24px' }}>
                    Linear-style 7-tab configuration for themes, scraper delay, database vacuuming, and telemetry.
                  </p>
                </div>
              )}
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* Ingestion Modal Placeholder */}
      <Modal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        title="Ingest Media & Narrative Entry"
        subtitle="Extract metadata from IMDb or start an original narrative canvas"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Enter an IMDb title URL (e.g. https://www.imdb.com/title/tt1375666/) to begin extraction.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="https://www.imdb.com/title/tt..."
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '13px',
              }}
            />
            <Button variant="primary">Extract</Button>
          </div>
        </div>
      </Modal>

      {/* 3. Real-Time Hardware Telemetry HUD Bar */}
      <TelemetryHUD />
    </div>
  );
}

export default App;
