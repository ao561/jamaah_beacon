// "Add to home screen" support and the one-time welcome flag.
//
// Chrome/Edge/Samsung fire `beforeinstallprompt`, which we capture so a button can show the
// native install dialog. Safari (iOS) has no such API, so iPhone users get instructions.

export type Platform = 'ios' | 'android' | 'desktop';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

// Registered at import time: the event can fire before React mounts.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as InstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notify();
});

export function onInstallAvailabilityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPromptInstall = () => deferredPrompt !== null;

/** Shows the browser's install dialog. Returns whether the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but Macs don't have touch screens.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/** In-app browsers (WhatsApp, Instagram, …) can't add to the home screen; users must open Safari/Chrome. */
export function isInAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok|GSA\//.test(navigator.userAgent);
}

/** Worth offering at all: not installed already, and on a phone or a browser that can install. */
export const installWorthOffering = () => !isStandalone() && (getPlatform() !== 'desktop' || canPromptInstall());

const WELCOMED_KEY = 'welcomed';
const NUDGE_KEY = 'install_nudge_dismissed';

const readFlag = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};
const setFlag = (key: string) => {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Shown again next visit; harmless.
  }
};

export const hasBeenWelcomed = () => readFlag(WELCOMED_KEY);
export const markWelcomed = () => setFlag(WELCOMED_KEY);
export const installNudgeDismissed = () => readFlag(NUDGE_KEY);
export const dismissInstallNudge = () => setFlag(NUDGE_KEY);
