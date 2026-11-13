/**
 * File Purpose: Extracts asset-bound SHA-256 checksums from GitHub release notes.
 * Communication Matrix: Imported by src/services/api.ts and tested in tests/releaseDigest.test.ts.
 */

export function extractSha256ForAsset(assetName: string, releaseBody?: string | null): string {
  if (!releaseBody || !assetName.trim()) return '';
  const escapedName = assetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const lineMatch = new RegExp(`([a-fA-F0-9]{64})\\s+\\*?${escapedName}(?![\\w.-])`, 'i').exec(releaseBody);
  if (lineMatch) return lineMatch[1].toLowerCase();

  const bsdMatch = new RegExp(`SHA256\\s*\\(${escapedName}\\)\\s*=\\s*([a-fA-F0-9]{64})`, 'i').exec(releaseBody);
  if (bsdMatch) return bsdMatch[1].toLowerCase();

  const reverseMatch = new RegExp(`${escapedName}\\s*[:=]\\s*([a-fA-F0-9]{64})`, 'i').exec(releaseBody);
  if (reverseMatch) return reverseMatch[1].toLowerCase();

  return '';
}
