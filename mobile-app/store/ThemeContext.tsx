/**
 * ThemeContext - Dark/Light mode for mobile app
 * Persists preference in AsyncStorage
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = 'app_theme';

export interface ThemeColors {
  bgDark: string;
  bgCard: string;
  bgElevated: string;
  bgInput: string;
  background: string;
  surface: string;
  text: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
}

const DARK_COLORS: ThemeColors = {
  bgDark: '#0a0e1a',
  bgCard: '#111827',
  bgElevated: '#1e293b',
  bgInput: '#1e293b',
  background: '#0a0e1a',
  surface: '#111827',
  text: '#f1f5f9',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  border: '#1e293b',
};

const LIGHT_COLORS: ThemeColors = {
  bgDark: '#f8fafc',
  bgCard: '#ffffff',
  bgElevated: '#f1f5f9',
  bgInput: '#f1f5f9',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  border: '#e2e8f0',
};

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  themeColors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  toggleTheme: () => {},
  themeColors: DARK_COLORS,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored !== null) {
        setIsDark(stored === 'dark');
      }
    });
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, themeColors: isDark ? DARK_COLORS : LIGHT_COLORS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}
