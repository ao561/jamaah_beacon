import { CircleCheck, LoaderCircle, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export interface ToastMessage {
  id: number;
  tone: 'success' | 'error';
  text: string;
}

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(7.5rem+env(safe-area-inset-top))] z-[1200] flex justify-center px-4" aria-live="polite">
      <div
        className={`flex max-w-sm animate-sheet-up items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl ${
          toast.tone === 'success' ? 'bg-slate-900 text-white' : 'bg-rose-600 text-white'
        }`}
      >
        {toast.tone === 'success' ? <CircleCheck className="size-5 shrink-0" /> : <TriangleAlert className="size-5 shrink-0" />}
        {toast.text}
      </div>
    </div>
  );
}

/** A floating instruction/status card just below the nav. */
export function Banner({ children, action, onDismiss }: { children: ReactNode; action?: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(7.5rem+env(safe-area-inset-top))] z-[1000] flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-slate-900/95 px-4 py-3 text-sm text-white shadow-xl">
        <div className="flex-1">{children}</div>
        {action}
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-mr-1 rounded-full p-1 text-white/70 hover:text-white">
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function BannerButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

/** Loading / empty / error hint shown above the action bar while browsing. */
export function StatusPill({ state, onRetry }: { state: 'loading' | 'empty' | 'error'; onRetry: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[1000] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 shadow-lg ring-1 ring-black/5">
        {state === 'loading' && (
          <>
            <LoaderCircle className="size-4 animate-spin text-emerald-700" /> Finding nearby jama'ah…
          </>
        )}
        {state === 'empty' && <>No jama'ah nearby right now. Be the first to host one.</>}
        {state === 'error' && (
          <>
            <TriangleAlert className="size-4 shrink-0 text-rose-600" /> Couldn't load beacons.
            <button type="button" onClick={onRetry} className="flex items-center gap-1 font-semibold text-emerald-700">
              <RefreshCw className="size-3.5" /> Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
