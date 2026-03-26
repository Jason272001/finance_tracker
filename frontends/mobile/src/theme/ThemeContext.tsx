import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { palette } from './theme';

const STORAGE_KEY = 'keeperbma_mobile_theme';

type ThemeMode = 'light' | 'dark';
type Theme = typeof palette.light;

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  isReady: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemColorScheme === 'dark' ? 'dark' : 'light');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          setMode(stored);
        } else {
          setMode(systemColorScheme === 'dark' ? 'dark' : 'light');
        }
      } finally {
        setIsReady(true);
      }
    };
    loadPreference();
  }, [systemColorScheme]);

  const toggleTheme = async () => {
    const nextMode: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    await AsyncStorage.setItem(STORAGE_KEY, nextMode);
  };

  const value = useMemo(() => ({
    theme: mode === 'dark' ? palette.dark : palette.light,
    isDark: mode === 'dark',
    isReady,
    toggleTheme,
  }), [isReady, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
