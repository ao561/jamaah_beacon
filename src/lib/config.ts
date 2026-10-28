import type { Coords, SalahName } from './types';

/** Used when geolocation is denied or unavailable (central London). */
export const FALLBACK_CENTER: Coords = [51.5074, -0.1278];

/** Fetch window, relative to now. Must stay inside the RLS insert/select windows in the migration. */
export const LOOKBACK_MINUTES = 15;
export const LOOKAHEAD_MINUTES = 120;

/** Markers disappear locally this long after iqamah. */
export const HIDE_AFTER_MINUTES = 10;

/** Fallback poll; realtime normally delivers changes instantly. */
export const REFRESH_INTERVAL_MS = 60_000;

export const IQAMAH_OFFSETS = [5, 10, 15, 20] as const;

export const SALAH_COLORS: Record<SalahName, string> = {
  Fajr: '#6366f1',
  Dhuhr: '#0284c7',
  Asr: '#059669',
  Maghrib: '#e11d48',
  Isha: '#334155',
};
