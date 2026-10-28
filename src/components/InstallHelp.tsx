import { Download, EllipsisVertical, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canPromptInstall, getPlatform, isInAppBrowser, onInstallAvailabilityChange, promptInstall } from '../lib/install';

/** Platform-appropriate way to add the app to the home screen: a real button where possible, else steps. */
export function InstallHelp({ onInstalled }: { onInstalled?: () => void }) {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  useEffect(() => onInstallAvailabilityChange(() => setCanPrompt(canPromptInstall())), []);

  const platform = getPlatform();

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          if (await promptInstall()) onInstalled?.();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 py-3 text-base font-semibold text-white hover:bg-emerald-800"
      >
        <Download className="size-5" /> Install the app
      </button>
    );
  }

  if (isInAppBrowser()) {
    return (
      <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
        You've opened this inside another app. Open it in {platform === 'ios' ? 'Safari' : 'Chrome'} first (look for "Open in
        browser" in the menu), then add it to your home screen from there.
      </p>
    );
  }

  const steps =
    platform === 'ios'
      ? [
          { icon: <Share className="size-4" />, text: "Tap the Share button in Safari's toolbar" },
          { icon: <SquarePlus className="size-4" />, text: 'Scroll down and tap "Add to Home Screen"' },
          { icon: null, text: 'Tap "Add", and it opens like an app from now on' },
        ]
      : [
          { icon: <EllipsisVertical className="size-4" />, text: "Tap your browser's menu" },
          { icon: <SquarePlus className="size-4" />, text: 'Tap "Add to Home screen" or "Install app"' },
          { icon: null, text: 'Confirm, and it opens like an app from now on' },
        ];

  return (
    <ol className="space-y-2">
      {steps.map(({ icon, text }, i) => (
        <li key={i} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {i + 1}
          </span>
          <span className="flex items-center gap-1.5">
            {text}
            {icon && <span className="text-slate-500 dark:text-slate-400">{icon}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
