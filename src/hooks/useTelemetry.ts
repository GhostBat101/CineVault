/**
 * File Purpose: Polling hook for local hardware telemetry metrics and dynamic VRAM threshold monitoring.
 * Communication Matrix: Imported by TelemetryHUD.tsx and Titlebar.tsx; queries api.getTelemetry via Tauri IPC.
 */

import { useState, useEffect } from 'react';
import { HardwareTelemetry } from '../types';
import { api } from '../services/api';
import { evaluateVramStatus } from '../utils/telemetry';

export function useTelemetry(refreshIntervalMs = 1000) {
  const [telemetry, setTelemetry] = useState<HardwareTelemetry>({
    cpuUsagePercent: 0,
    ramUsedMb: 0,
    ramTotalMb: 16384,
    gpuName: 'Initializing Hardware Sensor...',
    vramUsedMb: 0,
    vramTotalMb: 2048,
    isVramCritical: false,
    activeOffloadMode: 'gpu_auto',
    gpuLayersOffloaded: 0,
    totalGpuLayers: 28,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchTelemetry = async () => {
      try {
        const data = await api.getTelemetry();
        if (isMounted) {
          const isCritical = evaluateVramStatus(data.vramUsedMb, data.vramTotalMb);
          setTelemetry({
            ...data,
            totalGpuLayers: data.totalGpuLayers ?? data.totalLayers ?? 28,
            activeOffloadMode: data.activeOffloadMode ?? 'gpu_auto',
            isVramCritical: Boolean(data.isVramCritical || isCritical),
          });
        }
      } catch (err) {
        console.error('[Telemetry Poller Error]', err);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, refreshIntervalMs);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [refreshIntervalMs]);

  return telemetry;
}
