import { useEffect, useState } from 'react';
import { applyTheme, getThemePref, saveThemePref, THEME_ORDER, watchSystemTheme, type ThemePref } from '../lib/theme';

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);

  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [pref]);

  const cycle = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
    saveThemePref(next);
    setPref(next);
  };

  return { pref, cycle };
}
