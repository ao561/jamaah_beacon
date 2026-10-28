// Light / dark theme, light by default. index.html applies a saved "dark" before first paint
// (keep its inline script in sync with this file).

export type ThemePref = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const THEME_COLORS = { light: '#047857', dark: '#0f172a' };

export function getThemePref(): ThemePref {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function saveThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Not remembered across reloads.
  }
}

export function applyTheme(pref: ThemePref): void {
  document.documentElement.classList.toggle('dark', pref === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[pref]);
}
