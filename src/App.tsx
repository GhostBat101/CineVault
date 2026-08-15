import React, { useState } from "react";
import { ThemeName } from "./types";

export function App() {
  const [theme, setTheme] = useState<ThemeName>("theme-obsidian");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "director" | "settings">("dashboard");

  // Synchronize theme class on body
  React.useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  return (
    <div className="app-shell">
      {/* Titlebar */}
      <header
        style={{
          height: "var(--titlebar-height)",
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          fontSize: "13px",
          fontWeight: 500,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🎬</span>
          <span style={{ letterSpacing: "-0.01em" }}>CineVault</span>
          <span
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "var(--radius-full)",
              background: "var(--accent-subtle)",
              color: "var(--accent)",
            }}
          >
            v0.1.3
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeName)}
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 8px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            <option value="theme-obsidian">Obsidian Dark</option>
            <option value="theme-crimson">Crimson Noir</option>
            <option value="theme-midnight">Midnight Slate</option>
            <option value="theme-emerald">Cyber Emerald</option>
          </select>
        </div>
      </header>

      {/* Main Body */}
      <div className="app-body">
        {/* Collapsible Sidebar */}
        <aside
          style={{
            width: isSidebarCollapsed
              ? "var(--sidebar-width-collapsed)"
              : "var(--sidebar-width-expanded)",
            transition: "width var(--transition-normal)",
            backgroundColor: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "12px 8px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <button
              onClick={() => setActiveTab("dashboard")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                background: activeTab === "dashboard" ? "var(--accent-subtle)" : "transparent",
                color: activeTab === "dashboard" ? "var(--accent)" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              <span>🏠</span>
              {!isSidebarCollapsed && <span>Dashboard Deck</span>}
            </button>

            <button
              onClick={() => setActiveTab("director")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                background: activeTab === "director" ? "var(--accent-subtle)" : "transparent",
                color: activeTab === "director" ? "var(--accent)" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              <span>🎥</span>
              {!isSidebarCollapsed && <span>Director's Suite</span>}
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                background: activeTab === "settings" ? "var(--accent-subtle)" : "transparent",
                color: activeTab === "settings" ? "var(--accent)" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              <span>⚙️</span>
              {!isSidebarCollapsed && <span>Settings Suite</span>}
            </button>
          </div>

          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            style={{
              padding: "6px 8px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-tertiary)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            {isSidebarCollapsed ? "⮞" : "⮜ Collapse"}
          </button>
        </aside>

        {/* Content Area */}
        <main className="main-content" style={{ padding: "24px" }}>
          {activeTab === "dashboard" && (
            <div>
              <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Media & Narrative Deck</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "24px" }}>
                100% Offline Vault with Embedded Local AI & Relational Story Tracking.
              </p>

              {/* Empty state callout */}
              <div
                className="glass-panel"
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  border: "2px dashed var(--border-medium)",
                  borderRadius: "var(--radius-lg)",
                  cursor: "pointer",
                  maxWidth: "480px",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>✨</div>
                <h3 style={{ fontSize: "16px", marginBottom: "6px" }}>Create First Narrative Entry</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                  Paste an IMDb URL or start an original screenplay canvas.
                </p>
              </div>
            </div>
          )}

          {activeTab === "director" && (
            <div>
              <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Director's Pre-Production Suite</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                Save the Cat! Beat Sheets, Tension Matrices, and Sequential AI Continuity Audits.
              </p>
            </div>
          )}

          {activeTab === "settings" && (
            <div>
              <h1 style={{ fontSize: "24px", marginBottom: "8px" }}>Settings & Preferences</h1>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                Model Vault path, hardware allocation, and offline privacy controls.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Telemetry HUD Status Bar */}
      <footer
        style={{
          height: "var(--hud-height)",
          backgroundColor: "var(--bg-secondary)",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
        }}
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <span>CPU: 4.2%</span>
          <span>RAM: 1,240 / 16,384 MB</span>
          <span style={{ color: "var(--status-success)" }}>VRAM Budget: 1,120 / 2,048 MB (Safe)</span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span>Mode: GPU Auto (28/28 Layers)</span>
          <span style={{ color: "var(--status-success)" }}>● 100% Offline & Private</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
