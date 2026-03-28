import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_LOCALES,
  LANGUAGE_OPTIONS,
  SupportedLanguage,
  translations,
} from '../i18n/translations';

const STORAGE_KEY = 'keeperbma_mobile_language';

interface LanguageContextValue {
  language: SupportedLanguage;
  locale: string;
  isReady: boolean;
  options: Array<{ value: SupportedLanguage; label: string }>;
  setLanguage: (next: SupportedLanguage) => Promise<void>;
  t: (key: string, replacements?: Record<string, string | number | null | undefined>) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const replaceTokens = (
  template: string,
  replacements?: Record<string, string | number | null | undefined>
): string => {
  if (!replacements) return template;
  return Object.entries(replacements).reduce((result, [token, value]) => {
    return result.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value ?? ''));
  }, template);
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && stored in translations) {
          setLanguageState(stored as SupportedLanguage);
        }
      } finally {
        setIsReady(true);
      }
    };

    loadLanguage();
  }, []);

  const setLanguage = async (next: SupportedLanguage) => {
    setLanguageState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next);
  };

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: LANGUAGE_LOCALES[language] ?? LANGUAGE_LOCALES[DEFAULT_LANGUAGE],
    isReady,
    options: LANGUAGE_OPTIONS,
    setLanguage,
    t: (key, replacements) => {
      const dictionary = translations[language] ?? translations[DEFAULT_LANGUAGE];
      const fallback = translations[DEFAULT_LANGUAGE];
      const template = dictionary[key] ?? fallback[key] ?? key;
      return replaceTokens(template, replacements);
    },
  }), [isReady, language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
