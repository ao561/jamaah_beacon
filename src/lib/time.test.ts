import { describe, expect, it } from 'vitest';
import { formatCountdown, formatDays, getStatus, resolveIqamah } from './time';
import type { SalahName } from './types';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const MINUTE = 60_000;
const startingIn = (minutes: number, salah_name: SalahName = 'Asr') => ({
  salah_name,
  iqamah_time: new Date(NOW + minutes * MINUTE).toISOString(),
});

describe('getStatus', () => {
  it('is upcoming before the start', () => {
    expect(getStatus(startingIn(5), NOW)).toBe('upcoming');
    expect(getStatus(startingIn(0.01), NOW)).toBe('upcoming');
  });

  it('is in progress from the start until 10 minutes after', () => {
    expect(getStatus(startingIn(0), NOW)).toBe('in_progress');
    expect(getStatus(startingIn(-9.9), NOW)).toBe('in_progress');
    expect(getStatus(startingIn(-10), NOW)).toBe('ended');
  });

  it("keeps Jumu'ah for 40 minutes, to cover the khutbah", () => {
    expect(getStatus(startingIn(-39.9, 'Jumuah'), NOW)).toBe('in_progress');
    expect(getStatus(startingIn(-40, 'Jumuah'), NOW)).toBe('ended');
  });
});

describe('formatCountdown', () => {
  it('shows mm:ss under an hour and h:mm:ss over', () => {
    expect(formatCountdown(65_000)).toBe('01:05');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
  });

  it('rounds up part-seconds and ignores the sign', () => {
    expect(formatCountdown(500)).toBe('00:01');
    expect(formatCountdown(-65_000)).toBe('01:05');
    expect(formatCountdown(0)).toBe('00:00');
  });
});

describe('formatDays', () => {
  it('names common patterns', () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Mon–Fri');
    expect(formatDays([6, 0])).toBe('Weekends');
    expect(formatDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(formatDays([5])).toBe('Fridays');
  });

  it('lists other days in order, without duplicates', () => {
    expect(formatDays([3, 1, 1])).toBe('Mon, Wed');
  });
});

describe('resolveIqamah', () => {
  // Local time, so these hold in any time zone.
  const noon = new Date(2026, 10, 20, 12, 0, 30);

  it('adds an offset to now', () => {
    expect(resolveIqamah({ kind: 'offset', minutes: 15 }, noon)).toEqual(new Date(2026, 10, 20, 12, 15, 30));
  });

  it('reads a manual time as later today', () => {
    expect(resolveIqamah({ kind: 'manual', value: '13:15' }, noon)).toEqual(new Date(2026, 10, 20, 13, 15));
    // Within the last minute still counts as now, not tomorrow.
    expect(resolveIqamah({ kind: 'manual', value: '12:00' }, noon)).toEqual(new Date(2026, 10, 20, 12, 0));
  });

  it('reads a manual time that has passed as tomorrow', () => {
    expect(resolveIqamah({ kind: 'manual', value: '11:00' }, noon)).toEqual(new Date(2026, 10, 21, 11, 0));
  });

  it('rejects malformed times', () => {
    expect(resolveIqamah({ kind: 'manual', value: 'noon' }, noon)).toBeNull();
  });

  it('keeps a fixed time as-is', () => {
    expect(resolveIqamah({ kind: 'fixed', iso: '2026-11-20T13:15:00.000Z' }, noon)).toEqual(
      new Date('2026-11-20T13:15:00.000Z'),
    );
  });
});
