import { List, LoaderCircle, LocateFixed, LocateOff, Map as MapIcon, Plus } from 'lucide-react';

export type View = 'map' | 'list';

interface Props {
  view: View;
  onToggleView: () => void;
  hasLocation: boolean;
  publishing: boolean;
  onLocate: () => void;
  onHost: () => void;
}

export function FloatingActionBar({ view, onToggleView, hasLocation, publishing, onLocate, onHost }: Props) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[1000] flex items-center gap-3">
      <button
        type="button"
        onClick={onToggleView}
        className="pointer-events-auto flex h-12 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-slate-700 shadow-lg ring-1 ring-black/5 transition hover:bg-slate-50 active:scale-95 dark:bg-slate-900 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-slate-800"
      >
        {view === 'map' ? <List className="size-5" /> : <MapIcon className="size-5" />}
        {view === 'map' ? 'List' : 'Map'}
      </button>
      {view === 'map' && (
        <button
          type="button"
          onClick={onLocate}
          aria-label={hasLocation ? 'Centre on my location' : 'Set my location'}
          className="pointer-events-auto grid size-12 place-items-center rounded-full bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-lg ring-1 ring-black/5 dark:ring-white/10 transition hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95"
        >
          {hasLocation ? <LocateFixed className="size-5" /> : <LocateOff className="size-5" />}
        </button>
      )}
      <button
        type="button"
        onClick={onHost}
        disabled={publishing}
        className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-emerald-700 pr-6 pl-5 text-base font-semibold text-white shadow-xl shadow-emerald-900/25 transition hover:bg-emerald-800 active:scale-95 disabled:opacity-70"
      >
        {publishing ? <LoaderCircle className="size-5 animate-spin" /> : <Plus className="size-5" strokeWidth={2.5} />}
        {publishing ? 'Broadcasting…' : "Host a Jama'ah"}
      </button>
    </div>
  );
}
