/**
 * utils/semver.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: Minimal, crash-proof semantic-version comparison used by the GitHub
 *       release updater. Handles the messy reality of release tags:
 *       optional `v` prefix ("v0.4.0"), pre-release suffixes ("0.4.0-beta.2"),
 *       build metadata ("1.2.3+build5"), and non-numeric junk segments
 *       (treated as 0 instead of producing NaN comparisons).
 *
 * COMPARISON RULE: only the numeric CORE (dots-separated) is compared.
 * Pre-release/build tags never affect the verdict - "v0.4.0-beta" is NOT
 * newer than "0.4.0" and vice versa. Equal cores -> not newer.
 *
 * USES:    services/api.ts (checkForUpdates).
 * USED BY: tests/semver.test.ts (contract enforcement).
 */

/** Parse a version tag into numeric core segments; junk becomes 0. */
export function parseSemver(tag: string): number[] {
  const core = tag.replace(/^v/i, '').split('-')[0].split('+')[0];
  return core.split('.').map((seg) => {
    const n = parseInt(seg, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

/**
 * True when latestTag's numeric core is strictly greater than baseVersion's.
 * Missing segments count as zero ("1.2" vs "1.2.0" -> equal).
 */
export function isNewer(latestTag: string, baseVersion: string): boolean {
  const latest = parseSemver(latestTag);
  const base = parseSemver(baseVersion);
  const len = Math.max(latest.length, base.length);
  for (let i = 0; i < len; i++) {
    const diff = (latest[i] ?? 0) - (base[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}
