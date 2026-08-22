/**
 * telemetry/TelemetryHUD.tsx
 * ─────────────────────────────────────────────────────────────
 * WHAT: Persistent bottom status bar: live CPU/RAM/VRAM metrics (1s poll via
 *       useTelemetry), the VRAM-budget guardrail trigger that opens a detail
 *       popover, layer-offload counters, and the offline badge.
 *
 * PRIORITY GATING: the row is too wide for narrow windows, so metrics degrade
 *       by importance instead of being clipped: below 900px the RAM bar,
 *       Layer Offload, and Air-Gapped badge hide; below 640px only CPU +
 *       VRAM numbers remain. The footer may wrap to two rows when even the
 *       priority set cannot fit.
 *
 * USES:    hooks/useTelemetry.ts, hooks/useMediaQuery.ts.
 * USED BY: App.tsx.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry } from '../../hooks/useTelemetry';
import { useMediaQuery } from '../../hooks/useMediaQuery';

export const TelemetryHUD: React.FC = () => {
  /** Live hardware snapshot polled every second. */
  const telemetry = useTelemetry(1000);
  /** Whether the detail popover is open. */
  const [isExpanded, setIsExpanded] = useState(false);
  /** Last N CPU readings driving the mini sparkline (oldest first). */
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  /** Width breakpoints driving metric visibility. */
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const isMedium = useMediaQuery('(max-width: 900px)');

  // Append each new sample to the rolling sparkline window.
  useEffect(() => {
    setCpuHistory((prev) => [...prev.slice(-29), telemetry.cpuUsagePercent]);
  }, [telemetry.cpuUsagePercent]);

  /** SVG points string for the CPU sparkline (100x24 viewBox, newest right). */
  const cpuSparkPoints = cpuHistory
    .map((value, index) => {
      const x = (index / Math.max(1, cpuHistory.length - 1)) * 100;
      const y = 22 - (Math.min(100, value) / 100) * 20;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  /** Guarded RAM utilization percentage (0-100). */
  const ramPercent = Math.min(100, Math.round((telemetry.ramUsedMb / Math.max(1, telemetry.ramTotalMb)) * 100));
  /** Guarded VRAM utilization percentage (0-100). */
  const vramPercent = Math.min(100, Math.round((telemetry.vramUsedMb / Math.max(1, telemetry.vramTotalMb)) * 100));

  /** Semantic color for the VRAM guardrail. */
  const getVramStatusColor = () => {
    if (telemetry.isVramCritical) return 'var(--status-danger)';
    if (vramPercent > 75) return 'var(--status-warning)';
    return 'var(--status-success)';
  };

  // Outside-click + Escape close the popover.
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isExpanded) return;
    const handleOutsideOrEscape = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        setIsExpanded(false);
      } else if (e instanceof MouseEvent && rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideOrEscape);
    window.addEventListener('keydown', handleOutsideOrEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutsideOrEscape);
      window.removeEventListener('keydown', handleOutsideOrEscape);
    };
  }, [isExpanded]);

  return (
    <footer
      ref={rootRef}
      style={{
        minHeight: 'var(--hud-height)',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 12px',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary)',
        position: 'relative',
        userSelect: 'none',
        flexWrap: 'wrap',
        gap: '4px',
      }}
    >
      {/* Metrics Left - priority order: VRAM > CPU > RAM */}
      <div style={{ display: 'flex', gap: isNarrow ? '10px' : '16px', alignItems: 'center' }}>
        {/* CPU - always visible, with rolling sparkline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: 'var(--text-muted)' }}>CPU</span>
          <span style={{ fontWeight: 600 }}>{telemetry.cpuUsagePercent}%</span>
          {!isNarrow && cpuHistory.length > 1 && (
            <svg
              width="52"
              height="16"
              viewBox="0 0 100 24"
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ opacity: 0.8 }}
            >
              <polyline
                points={cpuSparkPoints}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>

        {/* RAM - hidden below 900px */}
        {!isMedium && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-muted)' }}>RAM</span>
            <span style={{ fontWeight: 600 }}>
              {(telemetry.ramUsedMb / 1024).toFixed(1)} / {(telemetry.ramTotalMb / 1024).toFixed(1)} GB
            </span>
            <div
              style={{
                width: '36px',
                height: '4px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${ramPercent}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent)',
                  transition: 'width var(--transition-fast)',
                }}
              />
            </div>
          </div>
        )}

        {/* VRAM Guardrail (< 2GB) - always visible; click opens details */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsExpanded(!isExpanded);
            }
          }}
          title="Click to view detailed VRAM allocation breakdown"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>VRAM Budget</span>
          <span style={{ fontWeight: 600, color: getVramStatusColor() }}>
            {telemetry.vramUsedMb} / {telemetry.vramTotalMb} MB
          </span>
          {!isNarrow && (
            <div
              style={{
                width: '42px',
                height: '4px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-full)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${vramPercent}%`,
                  height: '100%',
                  backgroundColor: getVramStatusColor(),
                  transition: 'width var(--transition-fast)',
                }}
              />
            </div>
          )}
          {telemetry.isVramCritical && (
            <span
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: 'var(--status-danger)',
                fontWeight: 700,
              }}
            >
              SPILLOVER WARNING
            </span>
          )}
        </div>
      </div>

      {/* Status Right - hidden progressively at narrow widths */}
      <div style={{ display: 'flex', gap: isNarrow ? '10px' : '16px', alignItems: 'center', flexShrink: 0 }}>
        {!isMedium && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Layer Offload</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {telemetry.gpuLayersOffloaded} / {telemetry.totalGpuLayers} Layers
            </span>
          </div>
        )}

        {!isMedium && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--status-success)' }}>●</span>
            <span style={{ color: 'var(--text-muted)' }}>100% Offline Air-Gapped</span>
          </div>
        )}

        {/* Compact escape hatch: reopen the detail popover on tiny widths */}
        {isMedium && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label="Toggle hardware details"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xs)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              padding: '1px 6px',
            }}
          >
            HW ▲
          </button>
        )}
      </div>

      {/* Expanded Popover Details */}
      {isExpanded && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '12px',
            width: '340px',
            maxWidth: 'calc(100vw - 24px)',
            marginBottom: '4px',
            padding: '16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
            zIndex: 50,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '12px' }}>
              Hardware Allocation Monitor
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              aria-label="Close hardware details"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div><strong>GPU Accelerator:</strong> {telemetry.gpuName || 'DirectX 12 Hardware Compositor'}</div>
            <div><strong>Active Execution Mode:</strong> {telemetry.activeOffloadMode}</div>
            <div><strong>Dynamic Offload:</strong> {telemetry.gpuLayersOffloaded} GPU / {telemetry.totalGpuLayers - telemetry.gpuLayersOffloaded} CPU Layers</div>
            <div><strong>Hard VRAM Ceiling:</strong> 2,048 MB (Strictly Enforced)</div>
            <div style={{ color: 'var(--status-success)', marginTop: '4px' }}>✓ Zero cloud pings or external telemetry</div>
          </div>
        </div>
      )}
    </footer>
  );
};
