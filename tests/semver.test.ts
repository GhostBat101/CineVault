/**
 * tests/semver.test.ts
 *
 * WHAT: Contract tests for the release-updater version comparison in
 *       src/utils/semver.ts. Locks down the exact behaviors the updater
 *       depends on: v-prefix tolerance, pre-release/build-tag stripping,
 *       NaN-proof junk handling, segment-length padding, and the strict-
 *       inequality verdict (equal versions are never "newer").
 *
 * USES:    vitest, src/utils/semver.ts.
 * USED BY: `npm test` / CI frontend job.
 */
import { describe, it, expect } from 'vitest';
import { parseSemver, isNewer } from '../src/utils/semver';

describe('parseSemver', () => {
  it('parses plain cores', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
  });

  it('strips the v prefix case-insensitively', () => {
    expect(parseSemver('v0.4.0')).toEqual([0, 4, 0]);
    expect(parseSemver('V10.20.30')).toEqual([10, 20, 30]);
  });

  it('strips pre-release and build metadata', () => {
    expect(parseSemver('0.4.0-beta.2')).toEqual([0, 4, 0]);
    expect(parseSemver('v1.2.3+build.5')).toEqual([1, 2, 3]);
  });

  it('treats non-numeric segments as zero instead of NaN', () => {
    expect(parseSemver('a.b.c')).toEqual([0, 0, 0]);
    // The historical bug: Number('beta') was NaN and poisoned comparisons.
    expect(parseSemver('0.4.0-beta')).not.toContain(Number.NaN);
  });
});

describe('isNewer', () => {
  const CURRENT = '0.3.21';

  it('detects a strictly newer patch/minor/major', () => {
    expect(isNewer('0.3.22', CURRENT)).toBe(true);
    expect(isNewer('0.4.0', CURRENT)).toBe(true);
    expect(isNewer('1.0.0', CURRENT)).toBe(true);
  });

  it('rejects older and equal versions', () => {
    expect(isNewer('0.3.21', CURRENT)).toBe(false);
    expect(isNewer('0.3.20', CURRENT)).toBe(false);
    expect(isNewer('0.2.99', CURRENT)).toBe(false);
  });

  it('ignores pre-release tags when comparing cores', () => {
    // Same core -> not newer, regardless of suffix.
    expect(isNewer('v0.3.21-beta', CURRENT)).toBe(false);
    // Newer core with a scary-looking suffix is still an update.
    expect(isNewer('v0.4.0-beta.1', CURRENT)).toBe(true);
  });

  it('pads missing segments with zeros', () => {
    expect(isNewer('0.4', CURRENT)).toBe(true);
    expect(isNewer('0.3', CURRENT)).toBe(false); // 0.3.0 < 0.3.21
    expect(isNewer('0.3.21.0', CURRENT)).toBe(false);
  });

  it('never crashes on garbage tags', () => {
    expect(isNewer('', CURRENT)).toBe(false);
    expect(isNewer('garbage', 'also-garbage')).toBe(false);
    expect(isNewer('9', '8.x')).toBe(true); // junk segments coerce to 0
  });
});
