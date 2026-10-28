import { RadioTower } from 'lucide-react';
import { SALAH_COLORS } from '../lib/config';
import { SALAH_NAMES, type SalahName } from '../lib/types';

export type SalahFilter = SalahName | 'All';

interface Props {
  activeCount: number;
  filter: SalahFilter;
  onFilterChange: (filter: SalahFilter) => void;
  demo: boolean;
}

export function NavigationBar({ activeCount, filter, onFilterChange, demo }: Props) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[1000] px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-white/95 px-4 py-2.5 shadow-lg ring-1 ring-black/5 backdrop-blur">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white">
          <RadioTower className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base leading-tight font-bold text-slate-900">Jama'ah Beacon</h1>
          <p className="text-xs text-slate-500">
            {activeCount === 0 ? 'No live beacons' : `${activeCount} live ${activeCount === 1 ? 'beacon' : 'beacons'}`}
          </p>
        </div>
        {demo && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
            Demo data
          </span>
        )}
      </div>

      <nav
        aria-label="Filter by prayer"
        className="pointer-events-auto mx-auto mt-2 flex max-w-xl gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]"
      >
        {(['All', ...SALAH_NAMES] as const).map((name) => {
          const active = filter === name;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange(name)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium shadow ring-1 transition ${
                active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white/95 text-slate-700 ring-black/5 hover:bg-white'
              }`}
            >
              {name !== 'All' && (
                <span className="size-2 rounded-full" style={{ backgroundColor: SALAH_COLORS[name] }} aria-hidden />
              )}
              {name}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
