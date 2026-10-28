import { BadgeCheck, Camera, Repeat, Users } from 'lucide-react';
import { useState } from 'react';
import { SALAH_COLORS, SALAH_LABELS, startLabel } from '../lib/config';
import { distanceMeters, formatDistance } from '../lib/geo';
import type { Membership } from '../lib/memberships';
import { formatClock, formatDays, getStatus, msUntil } from '../lib/time';
import type { Beacon, Coords } from '../lib/types';

type Sort = 'soonest' | 'nearest';

interface Props {
  beacons: Beacon[];
  now: number;
  userLocation: Coords | null;
  roleFor: (beacon: Beacon) => Membership | undefined;
  onSelect: (beacon: Beacon) => void;
}

function startsIn(beacon: Beacon, now: number): string {
  if (getStatus(beacon, now) === 'in_progress') return 'Praying now';
  const minutes = Math.max(1, Math.round(msUntil(beacon.iqamah_time, now) / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `in ${h} h ${m} min` : `in ${h} h`;
}

export function ListView({ beacons, now, userLocation, roleFor, onSelect }: Props) {
  const [sort, setSort] = useState<Sort>('soonest');
  const effectiveSort = sort === 'nearest' && userLocation ? 'nearest' : 'soonest';
  const distanceTo = (b: Beacon) => (userLocation ? distanceMeters(userLocation, [b.latitude, b.longitude]) : null);

  const sorted = [...beacons].sort((a, b) =>
    effectiveSort === 'nearest'
      ? distanceTo(a)! - distanceTo(b)!
      : new Date(a.iqamah_time).getTime() - new Date(b.iqamah_time).getTime(),
  );

  return (
    <section
      aria-label="Nearby jama'ahs"
      className="fixed inset-x-0 top-[calc(7.5rem+env(safe-area-inset-top))] bottom-0 z-[900] overflow-y-auto bg-slate-100 px-3 pb-28 dark:bg-slate-950"
    >
      <div className="mx-auto max-w-xl space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {beacons.length === 0 ? 'Nothing in the next 2 hours' : `${beacons.length} in the next 2 hours`}
          </p>
          <div className="flex rounded-full bg-white p-0.5 text-sm shadow ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10" role="group" aria-label="Sort">
            {(['soonest', 'nearest'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={effectiveSort === option}
                disabled={option === 'nearest' && !userLocation}
                title={option === 'nearest' && !userLocation ? 'Turn on location to sort by distance' : undefined}
                onClick={() => setSort(option)}
                className={`rounded-full px-3 py-1 font-medium capitalize transition disabled:opacity-40 ${
                  effectiveSort === option
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {sorted.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-600 shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10">
            No jama'ah nearby right now. Host one and others will see it here.
          </div>
        )}

        <ul className="space-y-2">
          {sorted.map((b) => {
            const role = roleFor(b);
            const distance = distanceTo(b);
            const live = getStatus(b, now) === 'in_progress';
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onSelect(b)}
                  className="flex w-full gap-3 rounded-2xl bg-white p-3.5 text-left shadow-sm ring-1 ring-black/5 transition hover:bg-slate-50 active:scale-[0.99] dark:bg-slate-900 dark:ring-white/10 dark:hover:bg-slate-800"
                >
                  <span className="w-1.5 shrink-0 rounded-full" style={{ backgroundColor: SALAH_COLORS[b.salah_name] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1 font-bold text-slate-900 dark:text-slate-100">
                        {SALAH_LABELS[b.salah_name]}
                        {b.host_verified && (
                          <BadgeCheck className="size-4 text-emerald-700 dark:text-emerald-400" aria-label="Verified host" />
                        )}
                      </span>
                      <span className={`shrink-0 text-sm font-semibold ${live ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {startsIn(b, now)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-700 dark:text-slate-300">{b.location_name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {startLabel(b.salah_name)} {formatClock(b.iqamah_time)}
                      </span>
                      {distance !== null && <span>{formatDistance(distance)}</span>}
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden /> {b.attendee_count}
                      </span>
                      {b.repeat_days && b.repeat_days.length > 0 && (
                        <span className="flex items-center gap-1 text-violet-700 dark:text-violet-300">
                          <Repeat className="size-3.5" aria-hidden /> {formatDays(b.repeat_days)}
                        </span>
                      )}
                      {b.photo_updated_at && <Camera className="size-3.5" aria-label="Has a photo" />}
                      {role && (
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {role.role === 'host' ? "You're hosting" : "You're going"}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
