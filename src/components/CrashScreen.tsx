import { RotateCw } from 'lucide-react';

/** Shown instead of a blank page if the app crashes while rendering. */
export function CrashScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sorry, Jama'ah Beacon hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          type="button"
          // Drop any share link, in case that beacon is what broke the page.
          onClick={() => window.location.assign(window.location.pathname)}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800"
        >
          <RotateCw className="size-5" /> Reload
        </button>
      </div>
    </div>
  );
}
