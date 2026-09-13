/**
 * File Purpose: Hardware telemetry calculation utilities enforcing strict 2.0 GB VRAM inference boundaries.
 * Communication Matrix: Imported by useTelemetry hook, telemetry HUD components, and telemetry test suite.
 */

export const HARD_VRAM_CAP_MB = 2048;
export const OS_HEADROOM_MB = 250;

export interface SafeLayerAllocation {
  offloadedLayers: number;
  isVramCritical: boolean;
  offloadMode: 'gpu_auto' | 'cpu_only' | 'gpu_partial_cpu';
}

export function calculateSafeGpuLayers(
  freeVramMb: number,
  modelSizeMb: number,
  totalLayers: number
): SafeLayerAllocation {
  const safeTotalLayers = Math.max(1, totalLayers);
  const cappedFreeVram = Math.max(0, Math.min(freeVramMb, HARD_VRAM_CAP_MB));
  const usableVramMb = Math.max(0, cappedFreeVram - OS_HEADROOM_MB);
  const mbPerLayer = modelSizeMb / safeTotalLayers;

  if (usableVramMb < mbPerLayer * 4) {
    return { offloadedLayers: 0, isVramCritical: true, offloadMode: 'cpu_only' };
  }

  const calculatedLayers = Math.min(safeTotalLayers, Math.floor(usableVramMb / Math.max(1, mbPerLayer)));

  return {
    offloadedLayers: calculatedLayers,
    isVramCritical: false,
    offloadMode: calculatedLayers >= safeTotalLayers ? 'gpu_auto' : 'gpu_partial_cpu',
  };
}

export function evaluateVramStatus(vramUsedMb: number, vramTotalMb: number): boolean {
  const effectiveTotal = Math.min(Math.max(vramTotalMb, 1), HARD_VRAM_CAP_MB);
  return vramUsedMb >= Math.max(0, effectiveTotal - 200);
}
