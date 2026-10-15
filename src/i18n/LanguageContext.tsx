import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Language, translations, TranslationDictionary } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  translations: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'fm26_app_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'it' || saved === 'en') {
        return saved;
      }
      // If browser language starts with 'en', default to English, else Italian
      if (typeof navigator !== 'undefined' && navigator.language?.startsWith('en')) {
        return 'en';
      }
    } catch {
      // ignore localStorage errors
    }
    return 'it';
  });

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch (e) {
      console.warn('Failed to save language in localStorage:', e);
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const currentDict = useMemo(() => translations[language] || translations.it, [language]);

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>, fallback?: string): string => {
      const parts = key.split('.');
      let current: any = currentDict;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          // Fallback to Italian if missing in English
          let itFallback: any = translations.it;
          for (const itPart of parts) {
            if (itFallback && typeof itFallback === 'object' && itPart in itFallback) {
              itFallback = itFallback[itPart];
            } else {
              itFallback = undefined;
              break;
            }
          }
          current = itFallback;
          break;
        }
      }

      if (typeof current !== 'string') {
        current = fallback || key;
      }

      // Replace interpolation parameters e.g. {days}, {count}
      if (params && typeof current === 'string') {
        for (const [paramKey, paramValue] of Object.entries(params)) {
          current = current.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
        }
      }

      return current;
    };
  }, [currentDict]);

  const contextValue = useMemo(() => ({
    language,
    setLanguage,
    t,
    translations: currentDict,
  }), [language, t, currentDict]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
