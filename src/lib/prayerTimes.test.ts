import { describe, expect, it } from 'vitest';
import { suggestSalah, timingWarning } from './prayerTimes';
import { DEFAULT_PRAYER_SETTINGS, type PrayerSettings } from './prayerSettings';
import type { Coords } from './types';

// London on Thursday 19 November 2026 (GMT, so local time is UTC), Moonsighting Committee:
// Fajr 05:46, sunrise 07:25, Dhuhr 11:51, Asr 13:44 (Hanafi 14:18), Maghrib 16:09, Isha 17:37.
const LONDON: Coords = [51.5074, -0.1278];
const thursday = (hhmm: string) => new Date(`2026-11-19T${hhmm}:00Z`);
const friday = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00Z`);
const settings = DEFAULT_PRAYER_SETTINGS;

describe('suggestSalah', () => {
  it.each([
    ['03:00', 'Isha'],
    ['06:30', 'Fajr'],
    ['09:00', 'Dhuhr'], // between sunrise and Dhuhr: the next prayer
    ['12:30', 'Dhuhr'],
    ['15:00', 'Asr'],
    ['16:45', 'Maghrib'],
    ['21:00', 'Isha'],
  ])('%s on a Thursday is %s', (time, expected) => {
    expect(suggestSalah(LONDON, thursday(time), settings)).toBe(expected);
  });

  it("suggests Jumu'ah at midday on a Friday", () => {
    expect(suggestSalah(LONDON, friday('12:30'), settings)).toBe('Jumuah');
  });
});

describe('timingWarning', () => {
  it('is quiet for a time inside the window', () => {
    expect(timingWarning(LONDON, 'Asr', thursday('15:00'), settings)).toBeNull();
  });

  it('warns before the window opens', () => {
    expect(timingWarning(LONDON, 'Asr', thursday('12:30'), settings)).toMatch(/Asr begins at/);
  });

  it('warns after the window closes', () => {
    expect(timingWarning(LONDON, 'Fajr', thursday('08:00'), settings)).toMatch(/Fajr time ends at/);
  });

  it("only allows Jumu'ah on Fridays", () => {
    expect(timingWarning(LONDON, 'Jumuah', thursday('12:30'), settings)).toBe("Jumu'ah is only on Fridays.");
    expect(timingWarning(LONDON, 'Jumuah', friday('12:30'), settings)).toBeNull();
  });

  it('treats Isha after midnight as the previous evening', () => {
    expect(timingWarning(LONDON, 'Isha', thursday('01:00'), settings)).toBeNull();
  });

  it('ends Dhuhr at the Asr convention the user picked', () => {
    // 14:00 is after Shafi'i Asr (13:44) but before Hanafi Asr (14:18).
    const at = thursday('14:00');
    expect(timingWarning(LONDON, 'Dhuhr', at, settings)).toBeNull(); // "either": the lenient bound
    const standard: PrayerSettings = { ...settings, asr: 'standard' };
    expect(timingWarning(LONDON, 'Dhuhr', at, standard)).toMatch(/Dhuhr time ends at/);
  });
});
