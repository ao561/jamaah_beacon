// This device's relationship to each beacon: hosting or attending, plus the secret token
// the server issued for it (needed to cancel / undo). The only client state we persist.

export type Role = 'host' | 'attendee';

export interface Membership {
  role: Role;
  /** null while a join is in flight, or for joins made before tokens existed. */
  token: string | null;
}

export type Memberships = Record<string, Membership>;

const STORAGE_KEY = 'joined_prayers';
const MAX_ENTRIES = 100;

const isMembership = (m: unknown): m is Membership =>
  typeof m === 'object' &&
  m !== null &&
  ((m as Membership).role === 'host' || (m as Membership).role === 'attendee') &&
  (typeof (m as Membership).token === 'string' || (m as Membership).token === null);

export function getMemberships(): Memberships {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    // v1 stored a plain list of joined ids.
    if (Array.isArray(parsed)) {
      return Object.fromEntries(
        parsed.filter((id): id is string => typeof id === 'string').map((id) => [id, { role: 'attendee', token: null }]),
      );
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.fromEntries(Object.entries(parsed).filter(([, m]) => isMembership(m)));
    }
  } catch {
    // Unreadable storage: start fresh.
  }
  return {};
}

/** Read-modify-write against localStorage, so concurrent tabs don't clobber each other. */
export function updateMemberships(update: (memberships: Memberships) => void): Memberships {
  const memberships = getMemberships();
  update(memberships);
  const trimmed = Object.fromEntries(Object.entries(memberships).slice(-MAX_ENTRIES));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Private mode / storage full: the action still happened server-side, it just won't be remembered.
  }
  return trimmed;
}
