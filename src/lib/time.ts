import { addDays, addMinutes, differenceInMilliseconds, isBefore, set, subMinutes } from 'date-fns';
import { HIDE_AFTER_MINUTES } from './config';

export type BeaconStatus = 'upcoming' | 'in_progress' | 'ended';

/** T > 0: upcoming; 0 >= T > -10m: in progress; otherwise ended (hidden). */
export function getStatus(iqamahTime: string, now: number): BeaconStatus {
  const remaining = msUntil(iqamahTime, now);
  if (remaining > 0) return 'upcoming';
  if (remaining > -HIDE_AFTER_MINUTES * 60_000) return 'in_progress';
  return 'ended';
}

export function msUntil(iqamahTime: string, now: number): number {
  return differenceInMilliseconds(new Date(iqamahTime), now);
}

/** mm:ss, or h:mm:ss past an hour. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(Math.abs(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatClock(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export type IqamahChoice = { kind: 'offset'; minutes: number } | { kind: 'manual'; value: string };

/**
 * Resolves the host's choice to a timestamp. A manual "HH:mm" earlier than now
 * is read as tomorrow, which the caller's lookahead check then rejects.
 */
export function resolveIqamah(choice: IqamahChoice, now = new Date()): Date | null {
  if (choice.kind === 'offset') return addMinutes(now, choice.minutes);

  const match = /^(\d{1,2}):(\d{2})$/.exec(choice.value);
  if (!match) return null;
  const candidate = set(now, { hours: Number(match[1]), minutes: Number(match[2]), seconds: 0, milliseconds: 0 });
  return isBefore(candidate, subMinutes(now, 1)) ? addDays(candidate, 1) : candidate;
}
