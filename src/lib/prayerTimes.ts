import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes } from 'adhan';
import { SALAH_LABELS } from './config';
import { METHODS, type PrayerSettings } from './prayerSettings';
import { formatClock } from './time';
import type { Coords, SalahName } from './types';

// Methods and madhabs disagree by up to ~40 minutes, so these times only drive
// suggestions and soft warnings, never validation. With the Asr setting on "either",
// we use the most lenient bound: Shafi'i Asr as Asr's start, Hanafi Asr as Dhuhr's end.

interface DayTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asrStandard: Date;
  asrHanafi: Date;
  /** Start of Asr / end of Dhuhr, per the Asr setting. */
  asrStart: Date;
  dhuhrEnd: Date;
  maghrib: Date;
  isha: Date;
}

function dayTimes([lat, lng]: Coords, date: Date, settings: PrayerSettings): DayTimes {
  const coordinates = new Coordinates(lat, lng);
  const calc = (madhab: (typeof Madhab)[keyof typeof Madhab]) => {
    const params = CalculationMethod[settings.method]();
    params.madhab = madhab;
    params.highLatitudeRule =
      settings.highLatitude === 'auto' ? HighLatitudeRule.recommended(coordinates) : settings.highLatitude;
    return new PrayerTimes(coordinates, date, params);
  };
  const standard = calc(Madhab.Shafi);
  const hanafi = calc(Madhab.Hanafi);
  return {
    fajr: standard.fajr,
    sunrise: standard.sunrise,
    dhuhr: standard.dhuhr,
    asrStandard: standard.asr,
    asrHanafi: hanafi.asr,
    asrStart: settings.asr === 'hanafi' ? hanafi.asr : standard.asr,
    dhuhrEnd: settings.asr === 'standard' ? standard.asr : hanafi.asr,
    maghrib: standard.maghrib,
    isha: standard.isha,
  };
}

export const isFriday = (date: Date) => date.getDay() === 5;

/** The prayer whose time contains `at`, or the next one if `at` falls in a gap (e.g. mid-morning). */
export function suggestSalah(coords: Coords, at: Date, settings: PrayerSettings): SalahName {
  const t = dayTimes(coords, at, settings);
  if (at < t.fajr) return 'Isha';
  if (at < t.sunrise) return 'Fajr';
  if (at < t.asrStart) return isFriday(at) ? 'Jumuah' : 'Dhuhr';
  if (at < t.maghrib) return 'Asr';
  if (at < t.isha) return 'Maghrib';
  return 'Isha';
}

function windowFor(t: DayTimes, salah: SalahName): [Date, Date | null] {
  const windows: Record<SalahName, [Date, Date | null]> = {
    Fajr: [t.fajr, t.sunrise],
    Dhuhr: [t.dhuhr, t.dhuhrEnd],
    Jumuah: [t.dhuhr, t.dhuhrEnd],
    Asr: [t.asrStart, t.maghrib],
    Maghrib: [t.maghrib, t.isha],
    Isha: [t.isha, null],
  };
  return windows[salah];
}

/** "Asr today: 14:11 – 16:41", for the line under the prayer picker. */
export function describeWindow(coords: Coords, salah: SalahName, at: Date, settings: PrayerSettings): string {
  const [start, end] = windowFor(dayTimes(coords, at, settings), salah);
  return `${SALAH_LABELS[salah]} today: ${formatClock(start)}${end ? ` – ${formatClock(end)}` : ' onwards'}`;
}

/** A gentle heads-up if the chosen time looks outside the prayer's window. */
export function timingWarning(coords: Coords, salah: SalahName, at: Date, settings: PrayerSettings): string | null {
  const t = dayTimes(coords, at, settings);
  const label = SALAH_LABELS[salah];
  const source = `By ${METHODS[settings.method].label} times`;
  const graceMs = 60_000;

  if (salah === 'Jumuah' && !isFriday(at)) return "Jumu'ah is only on Fridays.";
  // Isha after midnight belongs to the previous evening.
  if (salah === 'Isha' && at < t.fajr) return null;

  const [start, windowEnd] = windowFor(t, salah);
  const end = windowEnd ?? new Date(t.fajr.getTime() + 24 * 3600_000);
  if (at.getTime() < start.getTime() - graceMs) {
    return `${source}, ${label} begins at ${formatClock(start)}, after this time. Check your local timetable.`;
  }
  if (at >= end) {
    return `${source}, ${label} time ends at ${formatClock(end)}. Check your local timetable.`;
  }
  return null;
}

/** Today's full timetable, so users can compare against their mosque's. */
export function timetable(
  coords: Coords,
  date: Date,
  settings: PrayerSettings,
): { name: string; time: string; wide?: boolean }[] {
  const t = dayTimes(coords, date, settings);
  const asr =
    settings.asr === 'either'
      ? { name: 'Asr', time: `${formatClock(t.asrStandard)} (Hanafi ${formatClock(t.asrHanafi)})`, wide: true }
      : { name: 'Asr', time: formatClock(settings.asr === 'hanafi' ? t.asrHanafi : t.asrStandard) };
  return [
    { name: 'Fajr', time: formatClock(t.fajr) },
    { name: 'Sunrise', time: formatClock(t.sunrise) },
    { name: isFriday(date) ? "Dhuhr / Jumu'ah" : 'Dhuhr', time: formatClock(t.dhuhr) },
    { name: 'Maghrib', time: formatClock(t.maghrib) },
    { name: 'Isha', time: formatClock(t.isha) },
    asr,
  ];
}
