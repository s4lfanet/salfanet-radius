'use client';

import { useState, useCallback, useLayoutEffect } from 'react';

// Helper to get initial theme synchronously (reduces flash on first paint)
const getInitialTheme = (): boolean => {
  if (typeof window === 'undefined') return true; // default dark on server
  const stored = window.localStorage.getItem('theme');
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return stored ? stored === 'dark' : prefersDark;
};

export function useTheme() {
  // Use stable initial value (true = dark) to match server render.
  // Real value is applied in useLayoutEffect after mount, avoiding hydration mismatch.
  const [isDark, setIsDark] = useState<boolean>(true);

  const runWithoutTransitions = useCallback((fn: () => void) => {
    const html = document.documentElement;
    html.classList.add('theme-no-transition');
    fn();
    // Remove class after the next frame so styles apply without animating
    requestAnimationFrame(() => html.classList.remove('theme-no-transition'));
  }, []);

  // Apply theme immediately after mount to avoid visual flash (no transition here)
  useLayoutEffect(() => {
    runWithoutTransitions(() => {
      const dark = getInitialTheme();
      setIsDark(dark);
      const html = document.documentElement;
      html.classList.toggle('dark', dark);
      html.style.colorScheme = dark ? 'dark' : 'light';
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTheme = useCallback((next: boolean) => {
    runWithoutTransitions(() => {
      const html = document.documentElement;
      html.classList.toggle('dark', next);
      html.style.colorScheme = next ? 'dark' : 'light';
      window.localStorage.setItem('theme', next ? 'dark' : 'light');
      setIsDark(next);
    });
  }, [runWithoutTransitions]);

  const toggleTheme = useCallback(() => {
    applyTheme(!isDark);
  }, [applyTheme, isDark]);

  return { isDark, toggleTheme };
}
