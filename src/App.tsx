/**
 * App.tsx
 * ─────────────────────────────────────────────────────────────
 * WHAT: Root component. Owns navigation (activeTab + activeMode), the global
 *       search query, theme via useTheme, and the single useMediaLibrary
 *       instance (the de-facto app store). Renders one of four views and both
 *       global modals plus the telemetry HUD.
 *
 * VIEW SWITCHING: plain state (`activeTab`), no router. Views unmount when
 *       switched; DirectorSuite is additionally keyed by media id so switching
 *       the active title REMOUNTS its sub-views (prevents cross-title data
 *       bleed in TensionMatrixView / LoreNotesView / BeatSheetView).
 *
 * USES:    hooks/useTheme.ts, hooks/useMediaLibrary.ts,
 *          components/layout/{Titlebar,Sidebar,Navbar}.tsx,
 *          components/deck/{MediaGrid,IngestModal,MediaDetailModal}.tsx,
 *          components/director/DirectorSuite.tsx,
 *          components/vault/ModelVaultView.tsx,
 *          components/settings/SettingsView.tsx,
 *          components/telemetry/TelemetryHUD.tsx, types/index.ts.
 * USED BY: main.tsx.
 *
 * KEY STATE:
 *   activeTab        - which view is rendered (dashboard/director/model-vault/settings).
 *   activeMode       - cosmetic mode badge mirrored by Navbar's mode switcher.
 *   isSidebarCollapsed - sidebar expanded (240px) vs icon rail (68px).
 *   searchQuery      - live grid filter text from the Navbar.
 *   selectedMedia    - media entity driving the detail modal + Director Suite.
 *   isDetailModalOpen / isIngestModalOpen - modal visibility flags.
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
  /** Active theme name; applied to <body> class + persisted by the hook. */
  const { theme, setTheme } = useTheme('theme-obsidian');
  const { mediaList, isLoading, error, refreshMedia, prependMedia, updateMedia, removeMedia } =
    useMediaLibrary();

  /** True below 640px viewport - forces the sidebar into its icon rail. */
  const isNarrowViewport = useMediaQuery('(max-width: 640px)');
  /** Ref bound to the Navbar search input (global Ctrl+K focus target). */
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'director' | 'model-vault' | 'settings'>('dashboard');
  const [activeMode, setActiveMode] = useState<'cinephile' | 'director'>('cinephile');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected media for modal inspection & director suite
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);

  // SIDEBAR DESYNC GUARD: narrow viewports force the icon rail and block
  // manual expansion, so the rendered width always matches React state.
  useEffect(() => {
    if (isNarrowViewport) {
      setIsSidebarCollapsed(true);
    }
  }, [isNarrowViewport]);

  /** Ctrl+B toggle - a no-op while the viewport forces the rail. */
  const handleToggleCollapse = useCallback(() => {
    if (!isNarrowViewport) {
      setIsSidebarCollapsed((prev) => !prev);
    }
  }, [isNarrowViewport]);

  // GLOBAL HOTKEYS: Ctrl+K focuses the library search; Ctrl+N opens ingest.
  // Both are suppressed while the user is typing in an editable field or a
  // modal is open (Ctrl+K would yank focus out of composers; Ctrl+N would
  // stack a second dialog).
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
        // Focus after the dashboard (and its input) have mounted.
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (key === 'n' && !isDetailModalOpen && !isIngestModalOpen) {
        e.preventDefault();
        setIsIngestModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleHotkeys);
    return () => window.removeEventListener('keydown', handleHotkeys);
  }, [isDetailModalOpen, isIngestModalOpen]);

  /** Open the detail modal for a card/grid click. */
  const handleOpenDetail = useCallback((media: Media) => {
    setSelectedMedia(media);
    setIsDetailModalOpen(true);
  }, []);

  /** Jump straight into Director's Suite for a specific title. */
  const handleOpenDirectorSuite = useCallback((media: Media) => {
    setSelectedMedia(media);
    setActiveTab('director');
    setActiveMode('director');
  }, []);

  /**
   * A child (detail modal) persisted an update - mirror it into BOTH the
   * selected-media snapshot (so reopening shows fresh data) and the list.
   */
  const handleMediaUpdated = useCallback(
    (updated: Media) => {
      setSelectedMedia((current) => (current && current.id === updated.id ? updated : current));
      updateMedia(updated);
    },
    [updateMedia]
  );

  /**
   * Persist a watch-status change from a card's status pill, then mirror the
   * updated entity into local state. Failures surface via alert-free console
   * logging + thrown error boundary is NOT triggered (we keep the old value).
   */
  const handleStatusChange = useCallback(
    async (media: Media, nextStatus: WatchStatus) => {
      // Optimistic local update so the UI feels instant. Marking completed
      // stamps watchedDate here too (parity with the detail-modal dropdown).
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
        // Roll back to the pre-change entity on failure.
        handleMediaUpdated(media);
      }
    },
    [handleMediaUpdated]
  );

  /** Derived catalog stats for the dashboard hero tiles. */
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
      {/* 1. Custom Frameless Desktop Titlebar */}
      <Titlebar
        theme={theme}
        onThemeChange={setTheme}
        version={`v${versionData.version}`}
      />

      {/* 2. Main Shell Layout */}
      <div className="app-body">
        {/* Collapsible Navigation Sidebar (240px <-> 68px, forced rail <640px) */}
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
            searchInputRef={searchInputRef}
          />

          {/* Main View Container with Error Boundary (resetKeys clears stale
              error state when the view changes underneath it) */}
          <main className="main-content" style={{ padding: '24px' }}>
            <ErrorBoundary fallbackTitle="View Failed to Render" resetKeys={[activeTab, selectedMedia?.id]}>
              {activeTab === 'dashboard' && (
                <div>
                  {/* Dashboard Hero: kicker eyebrow + display title */}
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

                  {/* Catalog Stat Tiles */}
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

                  {/* Responsive Media Grid */}
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

              {/* Keyed by title id: switching titles remounts the whole suite so
                  every sub-view reloads ITS OWN persisted state (no cross-title bleed). */}
              {activeTab === 'director' && (
                <DirectorSuite
                  key={selectedMedia?.id ?? 'no-title'}
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

      {/* 3. Ingestion Modal - persists once itself, then reports to the store */}
      <IngestModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onMediaSaved={prependMedia}
      />

      {/* 4. Media Detail & AI Synthesis Modal */}
      <MediaDetailModal
        media={selectedMedia}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onOpenDirectorSuite={handleOpenDirectorSuite}
        onMediaUpdated={handleMediaUpdated}
        /** Backend deletion already confirmed in the modal - mirror removal. */
        onMediaDeleted={(mediaId) => {
          removeMedia(mediaId);
          setSelectedMedia(null);
          setIsDetailModalOpen(false);
        }}
      />

      {/* 5. Real-Time Hardware Telemetry HUD Bar */}
      <TelemetryHUD />
    </div>
  );
}

export default App;
