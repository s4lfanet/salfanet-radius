'use client';

import idTranslations from '@/locales/id.json';

export type Locale = 'id';

const translations = {
  id: idTranslations,
} as const;

type TranslationKeys = typeof idTranslations;

// Helper to get nested value
function getNestedValue(obj: any, path: string): string {
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key];
    } else {
      return path;
    }
  }
  
  return typeof result === 'string' ? result : path;
}

// Translation function with interpolation (Indonesian only)
function translate(
  key: string,
  params?: Record<string, string | number>
): string {
  let text = getNestedValue(idTranslations, key);
  
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }
  
  return text;
}

// React hook for translations
export function useTranslation() {
  const t = (key: string, params?: Record<string, string | number>): string => {
    return translate(key, params);
  };
  
  return {
    t,
    locale: 'id' as const,
    setLocale: (_newLocale: string) => {},
    isID: true,
    isEN: false,
  };
}

// Non-hook version for use outside React components
export function getTranslation(_locale?: string) {
  return {
    t: (key: string, params?: Record<string, string | number>) => 
      translate(key, params),
  };
}

// Export raw translations for direct access
export { translations };

// Type helpers
export type TranslationKey = keyof TranslationKeys['common'] 
  | keyof TranslationKeys['auth']
  | keyof TranslationKeys['nav']
  | keyof TranslationKeys['dashboard']
  | keyof TranslationKeys['pppoe']
  | keyof TranslationKeys['hotspot']
  | keyof TranslationKeys['invoices']
  | keyof TranslationKeys['keuangan']
  | keyof TranslationKeys['sessions']
  | keyof TranslationKeys['whatsapp']
  | keyof TranslationKeys['network']
  | keyof TranslationKeys['settings']
  | keyof TranslationKeys['management']
  | keyof TranslationKeys['notifications']
  | keyof TranslationKeys['errors']
  | keyof TranslationKeys['table']
  | keyof TranslationKeys['time']
  | keyof TranslationKeys['system'];
