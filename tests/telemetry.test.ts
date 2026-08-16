import { describe, it, expect } from 'vitest';

describe('Hardware Telemetry & VRAM Dynamic Offload Math Tests', () => {
  const HARD_VRAM_CAP_MB = 2048;
  const OS_HEADROOM_MB = 250;

  function calculateSafeGpuLayers(
    freeVramMb: number,
    modelSizeMb: number,
    totalLayers: number
  ): { offloadedLayers: number; isVramCritical: boolean; offloadMode: 'gpu_auto' | 'cpu_only' } {
    const usableVramMb = Math.max(0, Math.min(freeVramMb, HARD_VRAM_CAP_MB) - OS_HEADROOM_MB);
    const mbPerLayer = modelSizeMb / totalLayers;

    if (usableVramMb < mbPerLayer * 4) {
      return { offloadedLayers: 0, isVramCritical: true, offloadMode: 'cpu_only' };
    }

    const calculatedLayers = Math.min(totalLayers, Math.floor(usableVramMb / mbPerLayer));

    return {
      offloadedLayers: calculatedLayers,
      isVramCritical: false,
      offloadMode: 'gpu_auto',
    };
  }

  it('should offload all 28 layers if free VRAM exceeds model requirements under 2GB cap', () => {
    // 1600 MB free VRAM, 808 MB model (Llama-3.2-1B), 28 layers
    const result = calculateSafeGpuLayers(1600, 808, 28);
    expect(result.offloadedLayers).toBe(28);
    expect(result.isVramCritical).toBe(false);
    expect(result.offloadMode).toBe('gpu_auto');
  });

  it('should partially offload layers when VRAM is tight to strictly prevent OOM driver crashes', () => {
    // 500 MB free VRAM, 808 MB model, 28 layers -> Usable VRAM = 250 MB
    const result = calculateSafeGpuLayers(500, 808, 28);
    expect(result.offloadedLayers).toBeLessThan(28);
    expect(result.offloadedLayers).toBeGreaterThan(0);
  });

  it('should fallback to 100% CPU/RAM execution when VRAM is under critical threshold', () => {
    // 300 MB free VRAM -> Usable VRAM = 50 MB (less than 4 layers)
    const result = calculateSafeGpuLayers(300, 808, 28);
    expect(result.offloadedLayers).toBe(0);
    expect(result.isVramCritical).toBe(true);
    expect(result.offloadMode).toBe('cpu_only');
  });
});
