// Which beacons this device has already RSVP'd to (or hosted). The only client state we persist.

const STORAGE_KEY = 'joined_prayers';
const MAX_ENTRIES = 100;

export function getJoined(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function setJoined(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-MAX_ENTRIES)));
  } catch {
    // Private mode / storage full: RSVP still counts server-side, it just won't be remembered.
  }
}
