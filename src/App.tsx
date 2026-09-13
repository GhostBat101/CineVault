/**
 * File Purpose: Root application component coordinating navigation, global theme, media library state, modals, and telemetry HUD.
 * Communication Matrix: Imported by main.tsx; renders Titlebar, Sidebar, Navbar, MediaGrid, DirectorSuite, ModelVaultView, SettingsView, TelemetryHUD, and ToastViewport.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTheme } from './hooks/useTheme';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { useMediaQuery } from './hooks/useMediaQuery';
import { Titlebar } from './components/layout/Titlebar';
import { Sidebar } from './components/layout/Sidebar';
import { Navbar } from './components/layout/Navbar';
import { TelemetryHUD } from './components/telemetry/TelemetryHUD';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ToastViewport } from './components/common/Toast';
import { MediaGrid } from './components/deck/MediaGrid';
import { IngestModal } from './components/deck/IngestModal';
import { MediaDetailModal } from './components/deck/MediaDetailModal';
import { DirectorSuite } from './components/director/DirectorSuite';
import { ModelVaultView } from './components/vault/ModelVaultView';
import { SettingsView } from './components/settings/SettingsView';
import { Media, WatchStatus } from './types';
import { api } from './services/api';
import versionData from '../version.json';

export function App() {
  const { theme, setTheme } = useTheme('theme-obsidian');
  const { mediaList, isLoading, error, refreshMedia, prependMedia, updateMedia, removeMedia } =
    useMediaLibrary();

  const isNarrowViewport = useMediaQuery('(max-width: 640px)');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'director' | 'model-vault' | 'settings'>('dashboard');
  const [activeMode, setActiveMode] = useState<'cinephile' | 'director'>('cinephile');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  useEffect(() => {
    api.autoMigrateLocalStorageToDatabase().catch(() => {});
  }, []);

  useEffect(() => {
    if (isNarrowViewport) {
      setIsSidebarCollapsed(true);
    }
  }, [isNarrowViewport]);

  const handleToggleCollapse = useCallback(() => {
    if (!isNarrowViewport) {
      setIsSidebarCollapsed((prev) => !prev);
    }
  }, [isNarrowViewport]);

  useEffect(() => {
    const isTypingContext = (): boolean => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
    };

    const handleHotkeys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isTypingContext()) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setActiveTab('dashboard');
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (key === 'n' && !isDetailModalOpen && !isIngestModalOpen) {
        e.preventDefault();
        setIsIngestModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleHotkeys);
    return () => window.removeEventListener('keydown', handleHotkeys);
  }, [isDetailModalOpen, isIngestModalOpen]);

  const handleOpenDetail = useCallback((media: Media) => {
    setSelectedMedia(media);
    setIsDetailModalOpen(true);
  }, []);

  const handleOpenDirectorSuite = useCallback((media: Media) => {
    setSelectedMedia(media);
    setActiveTab('director');
    setActiveMode('director');
  }, []);

  const handleMediaUpdated = useCallback(
    (updated: Media) => {
      setSelectedMedia((current) => (current && current.id === updated.id ? updated : current));
      updateMedia(updated);
    },
    [updateMedia]
  );

  const handleStatusChange = useCallback(
    async (media: Media, nextStatus: WatchStatus) => {
      const optimistic: Media = {
        ...media,
        userStatus: nextStatus,
        watchedDate:
          nextStatus === 'completed' ? (media.watchedDate ?? new Date().toISOString()) : media.watchedDate,
        updatedAt: new Date().toISOString(),
      };
      handleMediaUpdated(optimistic);
      try {
        await api.saveMedia(optimistic);
      } catch (err) {
        console.error('[Status Change Error]', err);
        handleMediaUpdated(media);
      }
    },
    [handleMediaUpdated]
  );

  const catalogStats = useMemo(() => {
    const total = mediaList.length;
    const watching = mediaList.filter((m) => m.userStatus === 'watching').length;
    const completed = mediaList.filter((m) => m.userStatus === 'completed').length;
    const rated = mediaList.filter((m) => typeof m.imdbRating === 'number');
    const avgRating =
      rated.length > 0
        ? (rated.reduce((sum, m) => sum + (m.imdbRating || 0), 0) / rated.length).toFixed(1)
        : '—';
    const runtimeKnown = mediaList.filter((m) => typeof m.runtimeMinutes === 'number');
    const totalHours = Math.round(
      runtimeKnown.reduce((sum, m) => sum + (m.runtimeMinutes || 0), 0) / 60
    );
    return [
      { label: 'Titles', value: String(total), sub: 'in vault', accent: false },
      { label: 'Watching', value: String(watching), sub: 'in progress', accent: false },
      { label: 'Watched', value: String(completed), sub: 'completed', accent: false },
      { label: 'Avg IMDb', value: String(avgRating), sub: `across ${rated.length}`, accent: true },
      { label: 'Runtime', value: `${totalHours}h`, sub: 'total tracked', accent: false },
    ];
  }, [mediaList]);

  return (
    <div className="app-shell">
      <Titlebar
        theme={theme}
        onThemeChange={setTheme}
        version={`v${versionData.version}`}
      />

      <div className="app-body">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'director') setActiveMode('director');
            else if (tab === 'dashboard') setActiveMode('cinephile');
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          onOpenIngest={() => setIsIngestModalOpen(true)}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            searchInputRef={searchInputRef}
          />

          <main className="main-content" style={{ padding: '24px' }}>
            <ErrorBoundary fallbackTitle="View Failed to Render" resetKeys={[activeTab, selectedMedia?.id]}>
              {activeTab === 'dashboard' && (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <div
                      className="cv-kicker"
                      style={{
                        color: 'var(--accent)',
                        fontSize: 'var(--text-micro)',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Cinephile Deck
                    </div>
                    <h1 style={{ fontSize: 'var(--text-display)', letterSpacing: '-0.03em', marginBottom: '6px' }}>
                      Media & Narrative Library
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-body)' }}>
                      100% Offline Vault with Embedded Local AI (<span style={{ color: 'var(--accent)' }}>&lt; 2 GB VRAM</span>) & Relational Lore Tracking.
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '12px',
                      marginBottom: '20px',
                    }}
                  >
                    {catalogStats.map((stat) => (
                      <div key={stat.label} className="cv-stat-tile">
                        <div className="cv-kicker" style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          {stat.label}
                        </div>
                        <div
                          style={{
                            fontSize: '22px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: stat.accent ? 'var(--accent)' : 'var(--text-primary)',
                            lineHeight: 1.1,
                          }}
                        >
                          {stat.value}
                        </div>
                        {stat.sub && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {stat.sub}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <MediaGrid
                    mediaList={mediaList}
                    isLoading={isLoading}
                    loadError={error}
                    onRetryLoad={refreshMedia}
                    onSelectMedia={handleOpenDetail}
                    onOpenDirectorSuite={handleOpenDirectorSuite}
                    onStatusChange={handleStatusChange}
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

      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onMediaSaved={prependMedia}
      />

      <MediaDetailModal
        media={selectedMedia}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onOpenDirectorSuite={handleOpenDirectorSuite}
        onMediaUpdated={handleMediaUpdated}
        onMediaDeleted={(mediaId) => {
          removeMedia(mediaId);
          setSelectedMedia(null);
          setIsDetailModalOpen(false);
        }}
      />

      <TelemetryHUD />
      <ToastViewport />
    </div>
  );
}

export default App;
