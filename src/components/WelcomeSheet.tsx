import { ChevronLeft, MapPinned, RadioTower, Smartphone, UsersRound, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { installWorthOffering } from '../lib/install';
import { InstallHelp } from './InstallHelp';

interface Step {
  icon: ReactNode;
  tone: string;
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    icon: <RadioTower className="size-7" />,
    tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
    title: "Pray in jama'ah, wherever you are",
    body: (
      <>
        <p>
          See congregational prayers happening near you in the next 2 hours: in offices, libraries, parks and stations.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No sign-up. Your location stays on your phone unless you host.
        </p>
      </>
    ),
  },
  {
    icon: <UsersRound className="size-7" />,
    tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    title: 'Join one nearby',
    body: (
      <p>
        Tap a pin, or open <strong>List</strong>, to see when it starts, how to find it and walking directions. Tap{' '}
        <strong>Count me in</strong> so the host knows to expect you.
      </p>
    ),
  },
  {
    icon: <MapPinned className="size-7" />,
    tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    title: 'Or host your own',
    body: (
      <p>
        Tap <strong>Host a Jama'ah</strong>, pick the prayer and time, and drag the pin to the exact spot. Then share the
        link with your group. You can make it repeat every week.
      </p>
    ),
  },
];

const INSTALL_STEP: Step = {
  icon: <Smartphone className="size-7" />,
  tone: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  title: 'Add it to your home screen',
  body: <p>Open it in one tap next time, full screen like an app.</p>,
};

interface Props {
  open: boolean;
  onDone: () => void;
}

export function WelcomeSheet({ open, onDone }: Props) {
  const [index, setIndex] = useState(0);
  // Decided when opened: whether the browser can install can change while it's showing.
  const [steps, setSteps] = useState(STEPS);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setSteps(installWorthOffering() ? [...STEPS, INSTALL_STEP] : STEPS);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDone]);

  if (!open) return null;
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="w-full max-w-sm animate-sheet-up rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            aria-label="Back"
            className={`-ml-2 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 ${index === 0 ? 'invisible' : ''}`}
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-emerald-600' : 'w-1.5 bg-slate-300 dark:bg-slate-600'}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onDone}
            aria-label="Skip introduction"
            className="-mr-2 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="size-5" />
          </button>
        </div>

        <div key={index} className="mt-4 min-h-56 animate-sheet-up">
          <div className={`grid size-14 place-items-center rounded-2xl ${step.tone}`}>{step.icon}</div>
          <h2 id="welcome-title" className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">
            {step.title}
          </h2>
          <div className="mt-2 space-y-2 text-base leading-relaxed text-slate-700 dark:text-slate-300">{step.body}</div>
          {step === INSTALL_STEP && (
            <div className="mt-4">
              <InstallHelp onInstalled={onDone} />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => (last ? onDone() : setIndex((i) => i + 1))}
          className="mt-6 h-12 w-full rounded-2xl bg-slate-900 text-base font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {last ? 'Get started' : 'Next'}
        </button>
        {last && (
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
            We'll ask for your location next, to show what's nearby.
          </p>
        )}
      </div>
    </div>
  );
}
