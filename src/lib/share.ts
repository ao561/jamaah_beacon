import { formatClock } from './time';
import type { Prayer } from './types';

export const BEACON_PARAM = 'b';

export function beaconUrl(id: string): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(BEACON_PARAM, id);
  return url.toString();
}

/** The beacon id in the page URL, if the app was opened from a shared link. */
export function beaconIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(BEACON_PARAM);
}

/** Keeps the address bar pointing at the open beacon, so it can be copied as-is. */
export function syncBeaconUrl(id: string | null): void {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(BEACON_PARAM, id);
  else url.searchParams.delete(BEACON_PARAM);
  window.history.replaceState(null, '', url);
}

/** Opens the native share sheet, falling back to copying the link. */
export async function shareBeacon(beacon: Prayer): Promise<'shared' | 'copied' | 'dismissed'> {
  const url = beaconUrl(beacon.id);
  const text = `${beacon.salah_name} jama'ah at ${beacon.location_name}, iqamah ${formatClock(beacon.iqamah_time)}.`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Jama'ah Beacon", text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'dismissed';
      // Otherwise (e.g. not allowed in this context) fall through to copying.
    }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  return 'copied';
}
