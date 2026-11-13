/**
 * File Purpose: Unit tests for asset-bound SHA-256 digest extraction from GitHub release bodies.
 * Communication Matrix: Exercises extractSha256ForAsset from src/utils/releaseDigest.ts under Vitest.
 */

import { describe, it, expect } from 'vitest';
import { extractSha256ForAsset } from '../src/utils/releaseDigest';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('extractSha256ForAsset', () => {
  it('matches GNU coreutils sha256sum lines', () => {
    const body = `Release notes\n${HASH_A.toUpperCase()} *CineVault_0.3.24_x64-setup.exe\n`;
    expect(extractSha256ForAsset('CineVault_0.3.24_x64-setup.exe', body)).toBe(HASH_A);
  });

  it('matches BSD-style SHA256 lines', () => {
    const body = `SHA256 (CineVault_0.3.24_x64-setup.exe) = ${HASH_B}`;
    expect(extractSha256ForAsset('CineVault_0.3.24_x64-setup.exe', body)).toBe(HASH_B);
  });

  it('matches key-value asset digest lines', () => {
    const body = `CineVault_0.3.24_x64-setup.exe: ${HASH_A}`;
    expect(extractSha256ForAsset('CineVault_0.3.24_x64-setup.exe', body)).toBe(HASH_A);
  });

  it('selects the correct digest when multiple assets are listed', () => {
    const body = [
      `${HASH_A}  CineVault_0.3.24_portable.zip`,
      `${HASH_B}  CineVault_0.3.24_x64-setup.exe`,
    ].join('\n');
    expect(extractSha256ForAsset('CineVault_0.3.24_x64-setup.exe', body)).toBe(HASH_B);
  });

  it('rejects unbound generic SHA-256 strings to prevent cross-asset mismatch', () => {
    const body = `Commit SHA-256: ${HASH_A}\nNo installer digest published.`;
    expect(extractSha256ForAsset('CineVault_0.3.24_x64-setup.exe', body)).toBe('');
  });

  it('returns empty string for empty or missing inputs', () => {
    expect(extractSha256ForAsset('CineVault.exe', null)).toBe('');
    expect(extractSha256ForAsset('', `CineVault.exe: ${HASH_A}`)).toBe('');
  });
});
