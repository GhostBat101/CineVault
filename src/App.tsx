import { useState, useCallback } from 'react';
import { useTheme } from './hooks/useTheme';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { Titlebar } from './components/layout/Titlebar';
import { Sidebar } from './components/layout/Sidebar';
import { Navbar } from './components/layout/Navbar';
import { TelemetryHUD } from './components/telemetry/TelemetryHUD';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { MediaGrid } from './components/deck/MediaGrid';
import { IngestModal } from './components/deck/IngestModal';
import { MediaDetailModal } from './components/deck/MediaDetailModal';
import { DirectorSuite } from './components/director/DirectorSuite';
import { ModelVaultView } from './components/vault/ModelVaultView';
import { SettingsView } from './components/settings/SettingsView';
import { Media } from './types';
import versionData from '../version.json';

export function App() {
  const { theme, setTheme } = useTheme('theme-obsidian');
  const { mediaList, addMedia } = useMediaLibrary();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'director' | 'model-vault' | 'settings'>('dashboard');
  const [activeMode, setActiveMode] = useState<'cinephile' | 'director'>('cinephile');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected media for modal inspection & director suite
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  const handleOpenDetail = useCallback((media: Media) => {
    setSelectedMedia(media);
    setIsDetailModalOpen(true);
  }, []);

  const handleOpenDirectorSuite = useCallback((media: Media) => {
    setSelectedMedia(media);
    setActiveTab('director');
    setActiveMode('director');
  }, []);

  return (
    <div className="app-shell">
      {/* 1. Custom Frameless Desktop Titlebar */}
      <Titlebar
        theme={theme}
        onThemeChange={setTheme}
        version={`v${versionData.version}`}
      />

      {/* 2. Main Shell Layout */}
      <div className="app-body">
        {/* Collapsible Navigation Sidebar (240px <-> 68px) */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'director') setActiveMode('director');
            else if (tab === 'dashboard') setActiveMode('cinephile');
          }}
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
            activeTab={activeTab}
          />

          {/* Main View Container with Error Boundary */}
          <main className="main-content" style={{ padding: '24px' }}>
            <ErrorBoundary fallbackTitle="View Failed to Render">
              {activeTab === 'dashboard' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                      <h1 style={{ fontSize: '22px', marginBottom: '4px' }}>Media & Narrative Library</h1>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        100% Offline Vault with Embedded Local AI (<span style={{ color: 'var(--accent)' }}>&lt; 2 GB VRAM</span>) & Relational Lore Tracking.
                      </p>
                    </div>
                  </div>

                  {/* Responsive Media Grid */}
                  <MediaGrid
                    mediaList={mediaList}
                    onSelectMedia={handleOpenDetail}
                    onOpenDirectorSuite={handleOpenDirectorSuite}
                    onOpenIngest={() => setIsIngestModalOpen(true)}
                    searchQuery={searchQuery}
                  />
                </div>
              )}

              {activeTab === 'director' && (
                <DirectorSuite
                  media={selectedMedia}
                  mediaList={mediaList}
                  onSelectMedia={setSelectedMedia}
                />
              )}

              {activeTab === 'model-vault' && (
                <ModelVaultView />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  currentTheme={theme}
                  onThemeChange={setTheme}
                />
              )}
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* 3. Ingestion Modal */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onMediaSaved={(newMedia) => {
          addMedia(newMedia);
        }}
      />

      {/* 4. Media Detail & AI Synthesis Modal */}
      <MediaDetailModal
        media={selectedMedia}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onOpenDirectorSuite={handleOpenDirectorSuite}
      />

      {/* 5. Real-Time Hardware Telemetry HUD Bar */}
      <TelemetryHUD />
    </div>
  );
}

export default App;
