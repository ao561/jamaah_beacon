// An anonymous per-device id (so one device counts once towards hiding a beacon) and the
// beacons this device has reported, which it stops showing straight away.

export const REPORT_REASONS = {
  not_real: "Not a real jama'ah",
  wrong_location: 'Wrong or misleading location',
  inappropriate: 'Inappropriate content',
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

const DEVICE_KEY = 'device_id';
const REPORTED_KEY = 'reported_prayers';
const MAX_REPORTED = 100;

let fallbackDeviceId: string | null = null;

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // No storage: one id for this page load.
    return (fallbackDeviceId ??= randomId());
  }
}

export function getReported(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REPORTED_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function addReported(id: string): Set<string> {
  const ids = getReported();
  ids.add(id);
  try {
    localStorage.setItem(REPORTED_KEY, JSON.stringify([...ids].slice(-MAX_REPORTED)));
  } catch {
    // Not remembered across reloads; the server still has the report.
  }
  return ids;
}
