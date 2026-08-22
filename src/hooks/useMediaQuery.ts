/**
 * hooks/useMediaQuery.ts
 * ─────────────────────────────────────────────────────────────
 * WHAT: Subscribes a component to a CSS media query and re-renders when its
 *       match state flips. Used by layout chrome (Titlebar/Navbar/Settings/
 *       TelemetryHUD) to drive COMPACT rendering at narrow window widths -
 *       inline style objects cannot be reached by CSS media queries.
 *
 * USES:    Nothing (leaf hook).
 * USED BY: components/layout/{Titlebar,Navbar,Sidebar}.tsx,
 *          components/settings/SettingsView.tsx,
 *          components/telemetry/TelemetryHUD.tsx.
 *
 * RETURNS:
 *   matches - true while the viewport currently satisfies the query.
 */
import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  /** Current match state, initialized lazily from the live media query list. */
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);

    // Sync immediately in case the query string prop changed since init.
    setMatches(mediaQueryList.matches);

    /** Modern MediaQueryList change listener (Safari <14 fallback below). */
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange);
      return () => mediaQueryList.removeEventListener('change', handleChange);
    }

    // Legacy fallback for engines without addEventListener on MQL.
    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, [query]);

  return matches;
}
