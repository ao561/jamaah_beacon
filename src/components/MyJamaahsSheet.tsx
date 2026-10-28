import { LoaderCircle, Repeat, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getMyJamaahs, restartRegular, type MyJamaahs, type RegularSummary } from '../lib/account';
import { SALAH_COLORS, SALAH_LABELS, startLabel } from '../lib/config';
import { formatClock, formatDays } from '../lib/time';
import type { Prayer } from '../lib/types';
import { BottomSheet } from './BottomSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Open a beacon on the map. */
  onSelect: (beacon: Prayer) => void;
  onStopRegular: (regularId: string) => Promise<void>;
  notify: (tone: 'success' | 'error', text: string) => void;
}

export function MyJamaahsSheet({ open, onClose, onSelect, onStopRegular, notify }: Props) {
  const [data, setData] = useState<MyJamaahs | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getMyJamaahs());
    } catch (err) {
      console.error('Failed to load my jamaahs', err);
      notify('error', "Couldn't load your jama'ahs.");
    }
  }, [notify]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toggleRegular = async (regular: RegularSummary) => {
    setBusyId(regular.id);
    try {
      if (regular.active) await onStopRegular(regular.id);
      else await restartRegular(regular.id);
      await load();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : "Couldn't update it.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="mine-title">
      <div className="space-y-5 pt-1">
        <div className="flex items-center justify-between">
          <h2 id="mine-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
            My jama'ahs
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="size-5" />
          </button>
        </div>

        {!data ? (
          <div className="grid h-32 place-items-center">
            <LoaderCircle className="size-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <Section title="Hosting now" empty="Nothing you're hosting is live right now.">
              {data.hosting.map((b) => (
                <BeaconRow key={b.id} beacon={b} onClick={() => onSelect(b)} />
              ))}
            </Section>

            <Section title="Regular spots" empty={'No regular spots yet. Turn on "Repeat every week" when hosting.'}>
              {data.regulars.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: SALAH_COLORS[r.salah_name] }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900 dark:text-slate-100">
                      {SALAH_LABELS[r.salah_name]} · {r.time_of_day}
                    </span>
                    <span className="block truncate text-sm text-slate-600 dark:text-slate-400">
                      {formatDays(r.days)} · {r.location_name}
                    </span>
                    {!r.active && <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Stopped</span>}
                  </span>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void toggleRegular(r)}
                    className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
                      r.active
                        ? 'text-rose-700 ring-1 ring-rose-200 dark:text-rose-400 dark:ring-rose-900'
                        : 'text-emerald-700 ring-1 ring-emerald-200 dark:text-emerald-400 dark:ring-emerald-800'
                    }`}
                  >
                    {busyId === r.id ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : r.active ? (
                      <Repeat className="size-3.5" />
                    ) : (
                      <RotateCcw className="size-3.5" />
                    )}
                    {r.active ? 'Stop' : 'Restart'}
                  </button>
                </li>
              ))}
            </Section>

            <Section title="Joined recently" empty="Jama'ahs you join while signed in show up here for about a day.">
              {data.joined.map((b) => (
                <BeaconRow key={b.id} beacon={b} onClick={() => onSelect(b)} />
              ))}
            </Section>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h3>
      {children.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

function BeaconRow({ beacon, onClick }: { beacon: Prayer; onClick: () => void }) {
  const ended = new Date(beacon.iqamah_time).getTime() < Date.now() - 45 * 60_000;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={ended}
        className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-3 text-left hover:bg-slate-100 disabled:opacity-60 dark:bg-slate-800/60 dark:hover:bg-slate-700"
      >
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: SALAH_COLORS[beacon.salah_name] }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900 dark:text-slate-100">
            {SALAH_LABELS[beacon.salah_name]} · {startLabel(beacon.salah_name)} {formatClock(beacon.iqamah_time)}
          </span>
          <span className="block truncate text-sm text-slate-600 dark:text-slate-400">
            {beacon.location_name} · {beacon.attendee_count} attending
          </span>
        </span>
      </button>
    </li>
  );
}
