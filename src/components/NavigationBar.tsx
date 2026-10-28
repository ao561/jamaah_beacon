import { Monitor, Moon, RadioTower, Sun } from 'lucide-react';
import { SALAH_COLORS, SALAH_LABELS } from '../lib/config';
import type { ThemePref } from '../lib/theme';
import { SALAH_NAMES, type SalahName } from '../lib/types';

export type SalahFilter = SalahName | 'All';

interface Props {
  activeCount: number;
  filter: SalahFilter;
  onFilterChange: (filter: SalahFilter) => void;
  demo: boolean;
  /** Jumu'ah chip only matters on Fridays or when there's a live Jumu'ah beacon. */
  showJumuah: boolean;
  theme: ThemePref;
  onCycleTheme: () => void;
}

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };
const THEME_NAMES = { system: 'System', light: 'Light', dark: 'Dark' };

export function NavigationBar({ activeCount, filter, onFilterChange, demo, showJumuah, theme, onCycleTheme }: Props) {
  const ThemeIcon = THEME_ICONS[theme];
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[1000] px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-white/95 dark:bg-slate-900/95 px-4 py-2.5 shadow-lg ring-1 ring-black/5 dark:ring-white/10 backdrop-blur">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white">
          <RadioTower className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base leading-tight font-bold text-slate-900 dark:text-slate-100">Jama'ah Beacon</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {activeCount === 0 ? 'No live beacons' : `${activeCount} live ${activeCount === 1 ? 'beacon' : 'beacons'}`}
          </p>
        </div>
        {demo && (
          <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
            Demo data
          </span>
        )}
        <button
          type="button"
          onClick={onCycleTheme}
          aria-label={`Theme: ${THEME_NAMES[theme]}. Tap to change.`}
          title={`Theme: ${THEME_NAMES[theme]}`}
          className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ThemeIcon className="size-5" />
        </button>
      </div>

      <nav
        aria-label="Filter by prayer"
        className="pointer-events-auto mx-auto mt-2 max-w-xl overflow-x-auto pb-1 [scrollbar-width:none]"
      >
        {/* Centred when the chips fit; when they overflow, mx-auto resolves to 0 so scrolling starts at "All". */}
        <div className="mx-auto flex w-max gap-1.5">
          {(['All', ...SALAH_NAMES.filter((n) => n !== 'Jumuah' || showJumuah)] as const).map((name) => {
            const active = filter === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(name)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium shadow ring-1 transition ${
                  active ? 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white ring-slate-900 dark:ring-slate-100' : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 ring-black/5 dark:ring-white/10 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {name !== 'All' && (
                  <span className="size-2 rounded-full" style={{ backgroundColor: SALAH_COLORS[name] }} aria-hidden />
                )}
                {name === 'All' ? name : SALAH_LABELS[name]}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
