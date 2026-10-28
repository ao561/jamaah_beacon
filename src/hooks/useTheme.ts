import { useEffect, useState } from 'react';
import { applyTheme, getThemePref, saveThemePref, type ThemePref } from '../lib/theme';

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref);

  useEffect(() => applyTheme(pref), [pref]);

  const toggle = () => {
    const next = pref === 'dark' ? 'light' : 'dark';
    saveThemePref(next);
    setPref(next);
  };

  return { pref, toggle };
}
