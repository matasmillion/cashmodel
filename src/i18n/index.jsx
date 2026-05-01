// @ts-check
// i18n entry. Exposes:
//   • LocaleProvider — wraps the vendor portal (or any external surface)
//   • useT()         — translation lookup with nested-key dot access
//   • useLocale()    — current locale + setter
//   • formatDate / formatNumber / formatCurrency — Intl wrappers
//
// Locale preference persists in localStorage under `fr_locale`. The
// vendor portal also writes the choice into Clerk's publicMetadata so
// notification emails reach the vendor in their preferred language.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en';
import zhCN from './zh-CN';

const DICTS = { 'en': en, 'zh-CN': zhCN };
export const SUPPORTED_LOCALES = ['en', 'zh-CN'];
const DEFAULT_LOCALE = 'en';
const LS_KEY = 'fr_locale';

function readStoredLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const v = localStorage.getItem(LS_KEY);
    return SUPPORTED_LOCALES.includes(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

const LocaleContext = createContext({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
});

export function LocaleProvider({ children, initialLocale }) {
  const [locale, setLocaleState] = useState(initialLocale || readStoredLocale());

  const setLocale = useCallback((next) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    setLocaleState(next);
    try { localStorage.setItem(LS_KEY, next); } catch { /* ignore */ }
  }, []);

  // CJK typography rules (CLAUDE.md): line-height ≥ 1.6 and a Chinese
  // font fallback when zh-* is active. We toggle a class on <html> so
  // any descendant can opt in via `.cjk` rather than per-component css.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (locale.startsWith('zh')) root.classList.add('cjk');
    else root.classList.remove('cjk');
    root.setAttribute('lang', locale);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

function lookup(dict, key) {
  if (!dict || !key) return undefined;
  const parts = key.split('.');
  let cur = dict;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(str, vars) {
  if (typeof str !== 'string' || !vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : ''));
}

// Hook returning the translation function. Falls back to English when a
// key is missing in the active dictionary, then to the key itself so
// missing translations are visible in the UI rather than blank.
export function useT() {
  const { locale } = useLocale();
  return useCallback((key, vars) => {
    const v = lookup(DICTS[locale], key);
    if (typeof v === 'string') return interpolate(v, vars);
    const fallback = lookup(DICTS[DEFAULT_LOCALE], key);
    if (typeof fallback === 'string') return interpolate(fallback, vars);
    return key;
  }, [locale]);
}

export function formatDate(value, locale, opts) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, opts || { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function formatNumber(value, locale, opts) {
  if (value == null || Number.isNaN(Number(value))) return '';
  return new Intl.NumberFormat(locale, opts).format(Number(value));
}

export function formatCurrency(value, locale, currency = 'USD') {
  return formatNumber(value, locale, { style: 'currency', currency });
}
