/**
 * File Purpose: Theme persistence hook managing active dark theme class on HTML document root.
 * Communication Matrix: Imported by App.tsx and SettingsView.tsx; persists selection to localStorage.
 */

import { useState, useEffect } from 'react';
import { ThemeName } from '../types';

export function useTheme(defaultTheme: ThemeName = 'theme-obsidian') {
  const [theme, setTheme] = useState<ThemeName>(() => {
    return (localStorage.getItem('cinevault_theme') as ThemeName) || defaultTheme;
  });

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('cinevault_theme', theme);
  }, [theme]);

  return { theme, setTheme };
}
