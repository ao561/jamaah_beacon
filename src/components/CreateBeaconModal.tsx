import { addMinutes, format } from 'date-fns';
import { Droplets, MapPin, Move, Repeat, TriangleAlert, Users, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import { IQAMAH_OFFSETS, LOOKAHEAD_MINUTES, SALAH_COLORS, SALAH_LABELS, startLabel } from '../lib/config';
import { getPrayerSettings, METHODS, resetPrayerSettings, savePrayerSettings, type PrayerSettings } from '../lib/prayerSettings';
import { describeWindow, isFriday, suggestSalah, timingWarning } from '../lib/prayerTimes';
import { formatClock, formatDays, resolveIqamah, type IqamahChoice } from '../lib/time';
import { SALAH_NAMES, type Beacon, type Coords, type NewPrayer, type SalahName } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { PrayerSettingsPanel } from './PrayerSettingsPanel';

export type PinSource = 'gps' | 'manual' | 'map' | 'adjusted' | 'existing';

export type BeaconFormValues = Omit<NewPrayer, 'latitude' | 'longitude'> & {
  /** Weekdays to repeat on (0 = Sunday), or null for a one-off. Always null when editing. */
  repeatDays: number[] | null;
};

const WEEKDAY_CHIPS = [
  { day: 1, label: 'M' },
  { day: 2, label: 'T' },
  { day: 3, label: 'W' },
  { day: 4, label: 'T' },
  { day: 5, label: 'F' },
  { day: 6, label: 'S' },
  { day: 0, label: 'S' },
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const NAME_MAX = 80;
const NOTES_MAX = 280;
const LOW_ACCURACY_M = 50;

interface Props {
  open: boolean;
  /** Set when editing an existing beacon; the form starts from its values. */
  initial?: Beacon;
  /** Where the beacon will be; used for prayer-time suggestions. */
  coords: Coords;
  pinSource: PinSource;
  gpsAccuracy: number | null;
  error: string | null;
  onAdjustPin: () => void;
  onCancel: () => void;
  onSubmit: (values: BeaconFormValues) => void;
}

export function CreateBeaconModal({
  open,
  initial,
  coords,
  pinSource,
  gpsAccuracy,
  error,
  onAdjustPin,
  onCancel,
  onSubmit,
}: Props) {
  const now = useNow(10_000);
  const editing = initial !== undefined;
  // Until the host taps a prayer, follow the suggestion for the chosen time.
  const [picked, setPicked] = useState<SalahName | null>(initial?.salah_name ?? null);
  const [timing, setTiming] = useState<IqamahChoice>(
    initial ? { kind: 'fixed', iso: initial.iqamah_time } : { kind: 'offset', minutes: 10 },
  );
  const [locationName, setLocationName] = useState(initial?.location_name ?? '');
  const [notes, setNotes] = useState(initial?.location_notes ?? '');
  const [sisters, setSisters] = useState(initial?.sisters_friendly ?? false);
  const [wudu, setWudu] = useState(initial?.wudu_nearby ?? false);
  const [repeat, setRepeat] = useState(false);
  const [repeatDays, setRepeatDays] = useState<number[]>(() => [new Date().getDay()]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Settings depend on where the pin is, so they're re-read from storage on every render
  // (cheap) and this counter just forces a render after saving.
  const [, setSettingsVersion] = useState(0);
  const { settings: prayerSettings, saved: settingsSaved } = getPrayerSettings(coords);

  const changePrayerSettings = (next: PrayerSettings) => {
    savePrayerSettings(coords, next);
    setSettingsVersion((v) => v + 1);
  };
  const resetToDefault = () => {
    resetPrayerSettings(coords);
    setSettingsVersion((v) => v + 1);
  };

  const preview = resolveIqamah(timing, new Date(now));
  const friday = preview !== null && isFriday(preview);
  const options = SALAH_NAMES.filter((name) => name !== 'Jumuah' || friday);
  const suggested = preview ? suggestSalah(coords, preview, prayerSettings) : null;
  const salah = picked && options.includes(picked) ? picked : suggested;
  const timesLine = salah && preview ? describeWindow(coords, salah, preview, prayerSettings) : null;
  const warning = salah && preview ? timingWarning(coords, salah, preview, prayerSettings) : null;
  // Jumu'ah can only ever repeat on Fridays.
  const effectiveDays = salah === 'Jumuah' ? [5] : repeatDays;

  const toggleDay = (day: number) =>
    setRepeatDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const submittedAt = new Date();
    const iqamah = resolveIqamah(timing, submittedAt);

    if (!salah) return setLocalError('Choose which prayer you are leading.');
    if (!locationName.trim()) return setLocalError('Add a short location label so people can find you.');
    // A kept time may already have passed (the jama'ah is under way); the server allows that.
    if (!iqamah || (timing.kind !== 'fixed' && iqamah > addMinutes(submittedAt, LOOKAHEAD_MINUTES))) {
      return setLocalError(`Pick a ${startLabel(salah).toLowerCase()} time within the next ${LOOKAHEAD_MINUTES / 60} hours.`);
    }
    if (salah === 'Jumuah' && !isFriday(iqamah)) return setLocalError("Jumu'ah is only on Fridays. Choose Dhuhr instead.");
    if (repeat && !editing && effectiveDays.length === 0) return setLocalError('Pick at least one day to repeat on.');

    setLocalError(null);
    onSubmit({
      salah_name: salah,
      iqamah_time: iqamah.toISOString(),
      location_name: locationName.trim(),
      location_notes: notes.trim() || null,
      sisters_friendly: sisters,
      wudu_nearby: wudu,
      repeatDays: repeat && !editing ? effectiveDays : null,
    });
  };

  const shownError = localError ?? error;

  return (
    <BottomSheet open={open} onClose={onCancel} labelledBy="create-title">
      <form onSubmit={handleSubmit} className="space-y-5 pt-1" noValidate>
        <div className="flex items-center justify-between">
          <h2 id="create-title" className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {editing ? "Edit jama'ah" : "Host a Jama'ah"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="-mr-1 grid size-9 place-items-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <Field label="Prayer" hint={!picked && salah ? "suggested from today's prayer times" : undefined}>
          <div className={`grid gap-1.5 ${options.length === 6 ? 'grid-cols-3' : 'grid-cols-5'}`}>
            {options.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={salah === name}
                onClick={() => setPicked(name)}
                style={salah === name ? { backgroundColor: SALAH_COLORS[name] } : undefined}
                className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                  salah === name ? 'text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {SALAH_LABELS[name]}
              </button>
            ))}
          </div>
          {timesLine && (
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {timesLine} ·{' '}
              <button
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsOpen}
                className="font-medium text-emerald-700 dark:text-emerald-400 underline-offset-2 hover:underline"
              >
                {METHODS[prayerSettings.method].label}
              </button>
            </p>
          )}
          {settingsOpen && (
            <PrayerSettingsPanel
              settings={prayerSettings}
              saved={settingsSaved}
              coords={coords}
              date={preview ?? new Date(now)}
              onChange={changePrayerSettings}
              onReset={resetToDefault}
              onDone={() => setSettingsOpen(false)}
            />
          )}
          {warning && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 px-2.5 py-2 text-sm text-amber-900 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {warning}
            </p>
          )}
        </Field>

        <Field label={startLabel(salah ?? 'Dhuhr')} hint={preview ? `at ${formatClock(preview)}` : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {initial && (
              <Chip active={timing.kind === 'fixed'} onClick={() => setTiming({ kind: 'fixed', iso: initial.iqamah_time })}>
                Keep {formatClock(initial.iqamah_time)}
              </Chip>
            )}
            {IQAMAH_OFFSETS.map((minutes) => {
              const active = timing.kind === 'offset' && timing.minutes === minutes;
              return (
                <Chip key={minutes} active={active} onClick={() => setTiming({ kind: 'offset', minutes })}>
                  +{minutes}m
                </Chip>
              );
            })}
            <Chip
              active={timing.kind === 'manual'}
              onClick={() =>
                timing.kind !== 'manual' && setTiming({ kind: 'manual', value: format(addMinutes(new Date(), 30), 'HH:mm') })
              }
            >
              Custom
            </Chip>
          </div>
          {timing.kind === 'manual' && (
            <input
              type="time"
              aria-label={`${startLabel(salah ?? 'Dhuhr')} time`}
              value={timing.value}
              onChange={(e) => setTiming({ kind: 'manual', value: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            />
          )}
        </Field>

        <Field label="Location label" htmlFor="location-name">
          <input
            id="location-name"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="e.g. Library 3rd Floor"
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </Field>

        <Field label="How to find you" htmlFor="location-notes" hint="optional">
          <textarea
            id="location-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={NOTES_MAX}
            rows={2}
            placeholder="e.g. Behind aisle 14, by the quiet study carrels"
            className="w-full resize-none rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </Field>

        <div className="space-y-2">
          <Toggle checked={sisters} onChange={setSisters} icon={<Users className="size-5" />} label="Sisters' space accommodated" />
          <Toggle checked={wudu} onChange={setWudu} icon={<Droplets className="size-5" />} label="Wudu facilities nearby" />
        </div>

        {!editing && (
          <div className="space-y-2">
            <Toggle checked={repeat} onChange={setRepeat} icon={<Repeat className="size-5" />} label="Repeat every week" />
            {repeat && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
                {salah === 'Jumuah' ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400">Repeats every Friday at {preview ? formatClock(preview) : 'this time'}.</p>
                ) : (
                  <>
                    <div className="flex justify-between gap-1" role="group" aria-label="Repeat on">
                      {WEEKDAY_CHIPS.map(({ day, label }) => (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={repeatDays.includes(day)}
                          aria-label={DAY_NAMES[day]}
                          onClick={() => toggleDay(day)}
                          className={`grid size-10 place-items-center rounded-full text-sm font-semibold transition ${
                            repeatDays.includes(day) ? 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      {effectiveDays.length > 0
                        ? `${formatDays(effectiveDays)} at ${preview ? formatClock(preview) : 'this time'}, here.`
                        : 'Pick the days it repeats on.'}
                    </p>
                  </>
                )}
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Each day's beacon appears 2 hours before. It stops after 30 days with nobody joining, or whenever you stop it.
                </p>
              </div>
            )}
          </div>
        )}

        <PinSummary source={pinSource} gpsAccuracy={gpsAccuracy} onAdjust={onAdjustPin} />

        {shownError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 px-3 py-2.5 text-sm text-rose-800 dark:text-rose-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {shownError}
          </p>
        )}

        <button
          type="submit"
          className="h-14 w-full rounded-2xl bg-emerald-700 text-base font-semibold text-white transition hover:bg-emerald-800 active:scale-[0.98]"
        >
          {editing ? 'Save changes' : 'Broadcast beacon'}
        </button>
      </form>
    </BottomSheet>
  );
}

function PinSummary({ source, gpsAccuracy, onAdjust }: { source: PinSource; gpsAccuracy: number | null; onAdjust: () => void }) {
  const needsAdjusting = source === 'map';
  const lowAccuracy = source === 'gps' && gpsAccuracy !== null && gpsAccuracy > LOW_ACCURACY_M;
  const label = {
    gps: 'Pinned at your current location',
    manual: 'Pinned at the location you set',
    map: 'Your location is unavailable, so the pin is at the map centre',
    adjusted: 'Pin placed manually',
    existing: "Pin at the beacon's current spot",
  }[source];

  return (
    <div className={`rounded-2xl p-3 ${needsAdjusting ? 'bg-amber-50 dark:bg-amber-950/50 ring-1 ring-amber-200 dark:ring-amber-800' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
      <div className="flex items-start gap-2 text-sm">
        <MapPin className={`mt-0.5 size-4 shrink-0 ${needsAdjusting ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`} />
        <div className="flex-1">
          <p className={needsAdjusting ? 'font-medium text-amber-900 dark:text-amber-100' : 'text-slate-700 dark:text-slate-300'}>{label}</p>
          {lowAccuracy && (
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">
              GPS is only accurate to ±{Math.round(gpsAccuracy)} m here. Drag the pin to the exact spot.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAdjust}
        className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold ${
          needsAdjusting ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        <Move className="size-4" /> Adjust pin on map
      </button>
    </div>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {label}
        {hint && <span className="font-normal text-slate-500 dark:text-slate-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  icon,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left"
    >
      <span className="text-slate-500 dark:text-slate-400">{icon}</span>
      <span className="flex-1 text-base text-slate-800 dark:text-slate-200">{label}</span>
      <span className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
