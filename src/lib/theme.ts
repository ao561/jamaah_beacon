// Light / dark theme. "system" follows the device setting. index.html applies the saved
// choice before first paint (keep its inline script in sync with this file).

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'theme';
const THEME_COLORS = { light: '#047857', dark: '#0f172a' };

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function saveThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Not remembered across reloads.
  }
}

export function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && systemDark().matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

/** Re-applies "system" when the device switches between light and dark. Returns an unsubscribe. */
export function watchSystemTheme(onChange: () => void): () => void {
  const query = systemDark();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
