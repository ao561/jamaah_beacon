import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}

/**
 * Slide-up panel over the map on phones; a left-hand side panel from the `sm` breakpoint, so the
 * map and the selected pin stay visible beside it (App measures it via `data-sheet` to keep pins in view).
 *
 * Stays mounted while closed (just hidden) so form state survives being tucked away, e.g.
 * while the host adjusts the pin.
 */
export function BottomSheet({ open, onClose, labelledBy, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      data-sheet
      aria-labelledby={labelledBy}
      hidden={!open}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[1100] sm:top-[calc(7.75rem+env(safe-area-inset-top))] sm:right-auto sm:bottom-4 sm:left-4 sm:flex sm:w-[26rem] sm:items-end"
    >
      <div className="pointer-events-auto mx-auto flex max-h-[85dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_-8px_40px_rgb(0_0_0/0.18)] sm:max-h-full sm:rounded-3xl sm:shadow-2xl dark:bg-slate-900">
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
          <div className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
