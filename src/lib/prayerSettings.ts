import type { CalculationMethod } from 'adhan';
import { distanceMeters } from './geo';
import type { Coords } from './types';

// How this device calculates prayer times, remembered per area in localStorage, so a user
// can match the convention their community follows once (and another one when travelling).

export type MethodKey = Exclude<keyof typeof CalculationMethod, 'Other'>;
export type AsrSetting = 'either' | 'standard' | 'hanafi';
export type HighLatitudeSetting = 'auto' | 'middleofthenight' | 'seventhofthenight' | 'twilightangle';

export interface PrayerSettings {
  method: MethodKey;
  asr: AsrSetting;
  highLatitude: HighLatitudeSetting;
}

export const METHODS: Record<MethodKey, { label: string; detail: string }> = {
  MuslimWorldLeague: { label: 'Muslim World League', detail: 'Fajr 18°, Isha 17°' },
  MoonsightingCommittee: { label: 'Moonsighting Committee', detail: 'Seasonal; common in the UK and North America' },
  NorthAmerica: { label: 'ISNA (North America)', detail: 'Fajr 15°, Isha 15°' },
  Karachi: { label: 'Karachi (Univ. of Islamic Sciences)', detail: 'Fajr 18°, Isha 18°' },
  Egyptian: { label: 'Egyptian General Authority', detail: 'Fajr 19.5°, Isha 17.5°' },
  UmmAlQura: { label: 'Umm al-Qura (Makkah)', detail: 'Fajr 18.5°, Isha 90 min after Maghrib' },
  Dubai: { label: 'Dubai', detail: 'Fajr 18.2°, Isha 18.2°' },
  Kuwait: { label: 'Kuwait', detail: 'Fajr 18°, Isha 17.5°' },
  Qatar: { label: 'Qatar', detail: 'Fajr 18°, Isha 90 min after Maghrib' },
  Turkey: { label: 'Diyanet (Turkey)', detail: 'Fajr 18°, Isha 17°, with adjustments' },
  Singapore: { label: 'Singapore (MUIS)', detail: 'Fajr 20°, Isha 18°' },
  Tehran: { label: 'Tehran (Institute of Geophysics)', detail: 'Fajr 17.7°, Isha 14°' },
};

export const ASR_OPTIONS: Record<AsrSetting, string> = {
  either: "Either (accept Shafi'i or Hanafi timing)",
  standard: "Standard (Shafi'i, Maliki, Hanbali)",
  hanafi: 'Hanafi (later Asr)',
};

export const HIGH_LATITUDE_OPTIONS: Record<HighLatitudeSetting, string> = {
  auto: 'Automatic (recommended)',
  middleofthenight: 'Middle of the night',
  seventhofthenight: 'One-seventh of the night',
  twilightangle: 'Twilight angle',
};

/** Moonsighting Committee applies its own seasonal rules; the high-latitude rule has no effect on it. */
export const usesOwnHighLatitudeRule = (method: MethodKey) => method === 'MoonsightingCommittee';

export const DEFAULT_PRAYER_SETTINGS: PrayerSettings = { method: 'MoonsightingCommittee', asr: 'either', highLatitude: 'auto' };

/** Settings saved for a spot apply to any pin within this distance of it (roughly a city). */
export const AREA_RADIUS_KM = 50;

interface SavedArea {
  center: Coords;
  settings: PrayerSettings;
}

const STORAGE_KEY = 'prayer_settings_by_area';
const MAX_AREAS = 50;

function sanitize(raw: Partial<PrayerSettings> | undefined): PrayerSettings {
  const d = DEFAULT_PRAYER_SETTINGS;
  return {
    method: raw?.method && raw.method in METHODS ? raw.method : d.method,
    asr: raw?.asr && raw.asr in ASR_OPTIONS ? raw.asr : d.asr,
    highLatitude: raw?.highLatitude && raw.highLatitude in HIGH_LATITUDE_OPTIONS ? raw.highLatitude : d.highLatitude,
  };
}

function readAreas(): SavedArea[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (a): a is SavedArea =>
          Array.isArray(a?.center) && typeof a.center[0] === 'number' && typeof a.center[1] === 'number',
      )
      .map((a) => ({ center: a.center, settings: sanitize(a.settings) }));
  } catch {
    return [];
  }
}

function writeAreas(areas: SavedArea[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(areas.slice(-MAX_AREAS)));
  } catch {
    // Not remembered across reloads.
  }
}

/** Index of the closest saved area within range of `coords`, or -1. */
function nearestAreaIndex(areas: SavedArea[], coords: Coords): number {
  let best = -1;
  let bestDistance = AREA_RADIUS_KM * 1000;
  areas.forEach((area, i) => {
    const d = distanceMeters(area.center, coords);
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

/** Settings for the area around `coords`, and whether they were saved there or are the default. */
export function getPrayerSettings(coords: Coords): { settings: PrayerSettings; saved: boolean } {
  const areas = readAreas();
  const i = nearestAreaIndex(areas, coords);
  return i === -1 ? { settings: DEFAULT_PRAYER_SETTINGS, saved: false } : { settings: areas[i].settings, saved: true };
}

/** Saves for the area around `coords`: updates the nearby saved area, or starts a new one centred here. */
export function savePrayerSettings(coords: Coords, settings: PrayerSettings): void {
  const areas = readAreas();
  const i = nearestAreaIndex(areas, coords);
  if (i === -1) areas.push({ center: coords, settings });
  else areas[i] = { ...areas[i], settings };
  writeAreas(areas);
}

/** Forgets the saved settings for the area around `coords`, so the default applies again. */
export function resetPrayerSettings(coords: Coords): void {
  const areas = readAreas();
  const i = nearestAreaIndex(areas, coords);
  if (i !== -1) {
    areas.splice(i, 1);
    writeAreas(areas);
  }
}
