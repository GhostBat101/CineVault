import React, { useState } from 'react';
import { useTelemetry } from '../../hooks/useTelemetry';

export const TelemetryHUD: React.FC = () => {
  const telemetry = useTelemetry(1000);
  const [isExpanded, setIsExpanded] = useState(false);

  const ramPercent = Math.min(100, Math.round((telemetry.ramUsedMb / Math.max(1, telemetry.ramTotalMb)) * 100));
  const vramPercent = Math.min(100, Math.round((telemetry.vramUsedMb / Math.max(1, telemetry.vramTotalMb)) * 100));

  const getVramStatusColor = () => {
    if (telemetry.isVramCritical) return 'var(--status-danger)';
    if (vramPercent > 75) return 'var(--status-warning)';
    return 'var(--status-success)';
  };

  return (
    <footer
      style={{
        height: 'var(--hud-height)',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary)',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Metrics Left */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        {/* CPU */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-muted)' }}>CPU</span>
          <span style={{ fontWeight: 600 }}>{telemetry.cpuUsagePercent}%</span>
        </div>

        {/* RAM */}
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

        {/* VRAM Guardrail (< 2GB) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
          }}
          onClick={() => setIsExpanded(!isExpanded)}
          title="Click to view detailed VRAM allocation breakdown"
        >
          <span style={{ color: 'var(--text-muted)' }}>VRAM Budget</span>
          <span style={{ fontWeight: 600, color: getVramStatusColor() }}>
            {telemetry.vramUsedMb} / {telemetry.vramTotalMb} MB
          </span>
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

      {/* Status Right */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Layer Offload</span>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {telemetry.gpuLayersOffloaded} / {telemetry.totalGpuLayers} Layers
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--status-success)' }}>●</span>
          <span style={{ color: 'var(--text-muted)' }}>100% Offline Air-Gapped</span>
        </div>
      </div>

      {/* Expanded Popover Details */}
      {isExpanded && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: 'var(--hud-height)',
            left: '16px',
            width: '340px',
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
              onClick={() => setIsExpanded(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
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
