import { Smartphone, X } from 'lucide-react';
import { InstallHelp } from './InstallHelp';

/** One-time "add to home screen" card, shown after someone first joins or hosts. */
export function InstallNudge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1150] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="dialog"
        aria-labelledby="install-nudge-title"
        className="pointer-events-auto w-full max-w-md animate-sheet-up rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10"
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            <Smartphone className="size-5" />
          </div>
          <div className="flex-1">
            <p id="install-nudge-title" className="font-semibold text-slate-900 dark:text-slate-100">
              Add Jama'ah Beacon to your home screen?
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Open it in one tap next time, like an app.</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Not now"
            className="-mt-1 -mr-1 grid size-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="size-4" />
          </button>
        </div>
        <InstallHelp onInstalled={onDismiss} />
      </div>
    </div>
  );
}
