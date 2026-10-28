import type { ReactNode } from 'react';
import {
  ASR_OPTIONS,
  HIGH_LATITUDE_OPTIONS,
  AREA_RADIUS_KM,
  METHODS,
  usesOwnHighLatitudeRule,
  type AsrSetting,
  type HighLatitudeSetting,
  type MethodKey,
  type PrayerSettings,
} from '../lib/prayerSettings';
import { timetable } from '../lib/prayerTimes';
import type { Coords } from '../lib/types';

interface Props {
  settings: PrayerSettings;
  /** Whether these settings were saved for this area (vs. the default). */
  saved: boolean;
  coords: Coords;
  date: Date;
  onChange: (settings: PrayerSettings) => void;
  onReset: () => void;
  onDone: () => void;
}

export function PrayerSettingsPanel({ settings, saved, coords, date, onChange, onReset, onDone }: Props) {
  const times = timetable(coords, date, settings);
  const ownHighLatitudeRule = usesOwnHighLatitudeRule(settings.method);

  return (
    <div className="mt-2 space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div>
        <p className="text-sm font-semibold text-slate-800">Prayer time calculation</p>
        <p className="text-xs text-slate-500">
          Match the timetable your community follows. Changes are saved on this device for the area around this pin
          (about {AREA_RADIUS_KM} km).
        </p>
        <p className="mt-1.5 flex items-center justify-between gap-2 text-xs">
          <span className={saved ? 'font-medium text-emerald-700' : 'text-slate-500'}>
            {saved ? 'Using your saved settings for this area' : 'Using the default (Moonsighting Committee)'}
          </span>
          {saved && (
            <button type="button" onClick={onReset} className="shrink-0 font-semibold text-slate-600 underline-offset-2 hover:underline">
              Reset to default
            </button>
          )}
        </p>
      </div>

      <Select
        label="Method"
        hint={METHODS[settings.method].detail}
        value={settings.method}
        onChange={(method) => onChange({ ...settings, method: method as MethodKey })}
      >
        {(Object.keys(METHODS) as MethodKey[]).map((key) => (
          <option key={key} value={key}>
            {METHODS[key].label}
          </option>
        ))}
      </Select>

      <Select label="Asr" value={settings.asr} onChange={(asr) => onChange({ ...settings, asr: asr as AsrSetting })}>
        {(Object.keys(ASR_OPTIONS) as AsrSetting[]).map((key) => (
          <option key={key} value={key}>
            {ASR_OPTIONS[key]}
          </option>
        ))}
      </Select>

      <Select
        label="Summer adjustment"
        hint={
          ownHighLatitudeRule
            ? 'Moonsighting Committee applies its own seasonal adjustment, so this has no effect.'
            : 'Only matters where the sky never gets fully dark, e.g. the UK around June.'
        }
        disabled={ownHighLatitudeRule}
        value={settings.highLatitude}
        onChange={(highLatitude) => onChange({ ...settings, highLatitude: highLatitude as HighLatitudeSetting })}
      >
        {(Object.keys(HIGH_LATITUDE_OPTIONS) as HighLatitudeSetting[]).map((key) => (
          <option key={key} value={key}>
            {HIGH_LATITUDE_OPTIONS[key]}
          </option>
        ))}
      </Select>

      <div>
        <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Today at this pin</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
          {times.map(({ name, time, wide }) => (
            <div key={name} className={`flex justify-between gap-2 ${wide ? 'col-span-2' : ''}`}>
              <dt className="text-slate-500">{name}</dt>
              <dd className="font-medium text-slate-900 tabular-nums">{time}</dd>
            </div>
          ))}
        </dl>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-xl bg-white py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100"
      >
        Done
      </button>
    </div>
  );
}

function Select({
  label,
  hint,
  disabled,
  value,
  onChange,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full disabled:bg-slate-100 disabled:text-slate-400 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      >
        {children}
      </select>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
