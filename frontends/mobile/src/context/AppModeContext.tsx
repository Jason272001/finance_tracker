import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'keeperbma_mobile_app_mode';

export type AppMode = 'personal' | 'business';

interface AppModeContextValue {
  mode: AppMode;
  isReady: boolean;
  setMode: (next: AppMode) => Promise<void>;
  isBusinessMode: boolean;
}

const AppModeContext = createContext<AppModeContextValue | undefined>(undefined);

export const AppModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<AppMode>('personal');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadMode = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'personal' || stored === 'business') {
          setModeState(stored);
        }
      } finally {
        setIsReady(true);
      }
    };

    loadMode();
  }, []);

  const setMode = async (next: AppMode) => {
    setModeState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo<AppModeContextValue>(
    () => ({
      mode,
      isReady,
      setMode,
      isBusinessMode: mode === 'business',
    }),
    [isReady, mode]
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
};

export const useAppMode = () => {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within AppModeProvider');
  }
  return context;
};
