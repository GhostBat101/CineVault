import { useState, useEffect } from 'react';
import { HardwareTelemetry } from '../types';
import { api } from '../services/api';

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
          setTelemetry(data);
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
