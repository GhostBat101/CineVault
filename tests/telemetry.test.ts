import { describe, it, expect } from 'vitest';
import { HardwareTelemetry } from '../src/types';
import {
  calculateSafeGpuLayers,
  evaluateVramStatus,
  HARD_VRAM_CAP_MB,
  OS_HEADROOM_MB,
} from '../src/utils/telemetry';

describe('Hardware Telemetry & VRAM Dynamic Offload Tests', () => {
  it('should validate HardwareTelemetry interface conformance and default telemetry state', () => {
    const sampleTelemetry: HardwareTelemetry = {
      cpuUsagePercent: 12.5,
      ramUsedMb: 4096,
      ramTotalMb: 16384,
      gpuName: 'NVIDIA GeForce RTX 3060',
      vramUsedMb: 1100,
      vramTotalMb: 2048,
      isVramCritical: false,
      activeOffloadMode: 'gpu_auto',
      gpuLayersOffloaded: 28,
      totalGpuLayers: 28,
    };

    expect(sampleTelemetry.cpuUsagePercent).toBeGreaterThanOrEqual(0);
    expect(sampleTelemetry.ramUsedMb).toBeLessThanOrEqual(sampleTelemetry.ramTotalMb);
    expect(sampleTelemetry.vramUsedMb).toBeLessThanOrEqual(sampleTelemetry.vramTotalMb);
    expect(sampleTelemetry.gpuLayersOffloaded).toBe(sampleTelemetry.totalGpuLayers);
    expect(sampleTelemetry.isVramCritical).toBe(false);
  });

  it('should offload all 28 layers if free VRAM exceeds model requirements under 2GB cap', () => {
    const result = calculateSafeGpuLayers(1600, 808, 28);
    expect(result.offloadedLayers).toBe(28);
    expect(result.isVramCritical).toBe(false);
    expect(result.offloadMode).toBe('gpu_auto');
  });

  it('should partially offload layers when VRAM is tight to strictly prevent OOM driver crashes', () => {
    const result = calculateSafeGpuLayers(500, 808, 28);
    expect(result.offloadedLayers).toBeLessThan(28);
    expect(result.offloadedLayers).toBeGreaterThan(0);
    expect(result.offloadMode).toBe('gpu_partial_cpu');
  });

  it('should fallback to 100% CPU/RAM execution when VRAM is under critical threshold', () => {
    const result = calculateSafeGpuLayers(300, 808, 28);
    expect(result.offloadedLayers).toBe(0);
    expect(result.isVramCritical).toBe(true);
    expect(result.offloadMode).toBe('cpu_only');
  });

  it('should handle zero or negative free VRAM gracefully without crashing', () => {
    const zeroResult = calculateSafeGpuLayers(0, 808, 28);
    expect(zeroResult.offloadedLayers).toBe(0);
    expect(zeroResult.isVramCritical).toBe(true);
    expect(zeroResult.offloadMode).toBe('cpu_only');

    const negativeResult = calculateSafeGpuLayers(-100, 808, 28);
    expect(negativeResult.offloadedLayers).toBe(0);
    expect(negativeResult.isVramCritical).toBe(true);
    expect(negativeResult.offloadMode).toBe('cpu_only');
  });

  it('should strictly enforce the 2048 MB hard cap even if raw GPU reports huge VRAM', () => {
    const excessiveVramResult = calculateSafeGpuLayers(16384, 808, 28);
    const cappedUsable = HARD_VRAM_CAP_MB - OS_HEADROOM_MB;
    const mbPerLayer = 808 / 28;
    const expectedMaxLayers = Math.min(28, Math.floor(cappedUsable / mbPerLayer));

    expect(excessiveVramResult.offloadedLayers).toBe(expectedMaxLayers);
    expect(excessiveVramResult.isVramCritical).toBe(false);
  });

  it('should evaluate VRAM critical threshold correctly', () => {
    expect(evaluateVramStatus(1900, 2048)).toBe(true);
    expect(evaluateVramStatus(1500, 2048)).toBe(false);
    expect(evaluateVramStatus(2048, 2048)).toBe(true);
  });
});
