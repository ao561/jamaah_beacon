import { addMinutes, format } from 'date-fns';
import { Droplets, MapPin, Move, TriangleAlert, Users, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import { IQAMAH_OFFSETS, LOOKAHEAD_MINUTES, SALAH_COLORS } from '../lib/config';
import { formatClock, resolveIqamah, type IqamahChoice } from '../lib/time';
import { SALAH_NAMES, type NewPrayer, type SalahName } from '../lib/types';
import { BottomSheet } from './BottomSheet';

export type PinSource = 'gps' | 'manual' | 'map' | 'adjusted';

export type BeaconFormValues = Omit<NewPrayer, 'latitude' | 'longitude'>;

const NAME_MAX = 80;
const NOTES_MAX = 280;
const LOW_ACCURACY_M = 50;

interface Props {
  open: boolean;
  pinSource: PinSource;
  gpsAccuracy: number | null;
  error: string | null;
  onAdjustPin: () => void;
  onCancel: () => void;
  onSubmit: (values: BeaconFormValues) => void;
}

export function CreateBeaconModal({ open, pinSource, gpsAccuracy, error, onAdjustPin, onCancel, onSubmit }: Props) {
  const now = useNow(10_000);
  const [salah, setSalah] = useState<SalahName | null>(null);
  const [timing, setTiming] = useState<IqamahChoice>({ kind: 'offset', minutes: 10 });
  const [locationName, setLocationName] = useState('');
  const [notes, setNotes] = useState('');
  const [sisters, setSisters] = useState(false);
  const [wudu, setWudu] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const preview = resolveIqamah(timing, new Date(now));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const submittedAt = new Date();
    const iqamah = resolveIqamah(timing, submittedAt);

    if (!salah) return setLocalError('Choose which prayer you are leading.');
    if (!locationName.trim()) return setLocalError('Add a short location label so people can find you.');
    if (!iqamah || iqamah > addMinutes(submittedAt, LOOKAHEAD_MINUTES)) {
      return setLocalError(`Pick an iqamah time within the next ${LOOKAHEAD_MINUTES / 60} hours.`);
    }

    setLocalError(null);
    onSubmit({
      salah_name: salah,
      iqamah_time: iqamah.toISOString(),
      location_name: locationName.trim(),
      location_notes: notes.trim() || null,
      sisters_friendly: sisters,
      wudu_nearby: wudu,
    });
  };

  const shownError = localError ?? error;

  return (
    <BottomSheet open={open} onClose={onCancel} labelledBy="create-title">
      <form onSubmit={handleSubmit} className="space-y-5 pt-1" noValidate>
        <div className="flex items-center justify-between">
          <h2 id="create-title" className="text-xl font-bold text-slate-900">
            Host a Jama'ah
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="-mr-1 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <Field label="Prayer">
          <div className="grid grid-cols-5 gap-1.5">
            {SALAH_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={salah === name}
                onClick={() => setSalah(name)}
                style={salah === name ? { backgroundColor: SALAH_COLORS[name] } : undefined}
                className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                  salah === name ? 'text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Iqamah" hint={preview ? `at ${formatClock(preview)}` : undefined}>
          <div className="flex flex-wrap gap-1.5">
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
              aria-label="Iqamah time"
              value={timing.value}
              onChange={(e) => setTiming({ kind: 'manual', value: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
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
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
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
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
          />
        </Field>

        <div className="space-y-2">
          <Toggle checked={sisters} onChange={setSisters} icon={<Users className="size-5" />} label="Sisters' space accommodated" />
          <Toggle checked={wudu} onChange={setWudu} icon={<Droplets className="size-5" />} label="Wudu facilities nearby" />
        </div>

        <PinSummary source={pinSource} gpsAccuracy={gpsAccuracy} onAdjust={onAdjustPin} />

        {shownError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {shownError}
          </p>
        )}

        <button
          type="submit"
          className="h-14 w-full rounded-2xl bg-emerald-700 text-base font-semibold text-white transition hover:bg-emerald-800 active:scale-[0.98]"
        >
          Broadcast beacon
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
  }[source];

  return (
    <div className={`rounded-2xl p-3 ${needsAdjusting ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50'}`}>
      <div className="flex items-start gap-2 text-sm">
        <MapPin className={`mt-0.5 size-4 shrink-0 ${needsAdjusting ? 'text-amber-700' : 'text-slate-500'}`} />
        <div className="flex-1">
          <p className={needsAdjusting ? 'font-medium text-amber-900' : 'text-slate-700'}>{label}</p>
          {lowAccuracy && (
            <p className="mt-0.5 text-slate-500">
              GPS is only accurate to ±{Math.round(gpsAccuracy)} m here. Drag the pin to the exact spot.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onAdjust}
        className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold ${
          needsAdjusting ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100'
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
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold text-slate-800">
        {label}
        {hint && <span className="font-normal text-slate-500">{hint}</span>}
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
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
      <span className="text-slate-500">{icon}</span>
      <span className="flex-1 text-base text-slate-800">{label}</span>
      <span className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}>
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.375rem]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}
