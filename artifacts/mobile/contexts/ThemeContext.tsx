import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, ThemeId, ThemeColors } from '@/constants/colors';

const THEME_KEY = 'hollr_theme';

interface ThemeContextType {
  themeId: ThemeId;
  colors: ThemeColors;
  setTheme(id: ThemeId): void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('void');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(stored => {
      if (stored && stored in THEMES) {
        setThemeId(stored as ThemeId);
      }
    }).catch(() => {});
  }, []);

  const setTheme = (id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(THEME_KEY, id).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ themeId, colors: THEMES[themeId], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
