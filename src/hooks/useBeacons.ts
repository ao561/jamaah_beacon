import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { beaconApi, isInActiveWindow } from '../lib/beacons';
import { REFRESH_INTERVAL_MS } from '../lib/config';
import {
  getMemberships,
  getRegularHosts,
  membershipFor,
  updateMemberships,
  updateRegularHosts,
  type Membership,
  type Memberships,
  type RegularHosts,
} from '../lib/memberships';
import { addReported, getDeviceId, getReported, type ReportReason } from '../lib/reports';
import type { Beacon, NewPrayer, Prayer, PrayerChanges } from '../lib/types';

export type LoadState = 'loading' | 'ready' | 'error';

const PENDING_PREFIX = 'pending-';

export const isPendingId = (id: string) => id.startsWith(PENDING_PREFIX);

export type RemovalReason = 'cancelled' | 'hidden';

export interface Repeat {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  timeZone: string;
}

interface Options {
  /** A beacon disappeared because it was cancelled (possibly by this device) or hidden after reports. */
  onRemoteRemoval?: (beacon: Beacon, reason: RemovalReason) => void;
  /** A beacon's time or place changed (possibly by this device). */
  onRemoteChange?: (before: Beacon, after: Prayer) => void;
}

export function useBeacons({ onRemoteRemoval, onRemoteChange }: Options = {}) {
  const [allBeacons, setBeacons] = useState<Beacon[]>([]);
  const [reported, setReported] = useState<Set<string>>(getReported);
  // Reporting hides a beacon for this device immediately.
  const beacons = useMemo(() => allBeacons.filter((b) => !reported.has(b.id)), [allBeacons, reported]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [memberships, setMembershipsState] = useState<Memberships>(getMemberships);
  const [regularHosts, setRegularHostsState] = useState<RegularHosts>(getRegularHosts);

  const beaconsRef = useRef(beacons);
  beaconsRef.current = beacons;
  const onRemoteRemovalRef = useRef(onRemoteRemoval);
  onRemoteRemovalRef.current = onRemoteRemoval;
  const onRemoteChangeRef = useRef(onRemoteChange);
  onRemoteChangeRef.current = onRemoteChange;

  const editMemberships = useCallback(
    (update: (m: Memberships) => void) => setMembershipsState(updateMemberships(update)),
    [],
  );

  const setCount = useCallback(
    (id: string, count: (current: number) => number) =>
      setBeacons((prev) => prev.map((b) => (b.id === id ? { ...b, attendee_count: Math.max(1, count(b.attendee_count)) } : b))),
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const rows = await beaconApi.fetchActive();
      // Keep optimistic inserts that the server hasn't confirmed yet.
      setBeacons((prev) => [...rows, ...prev.filter((b) => b.pending)]);
      setLoadState('ready');
    } catch (err) {
      console.error('Failed to fetch beacons', err);
      // A failed background refresh keeps showing the last good data.
      setLoadState((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setMembershipsState(getMemberships());
        setRegularHostsState(getRegularHosts());
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const remove = (id: string, reason: RemovalReason) => {
      const gone = beaconsRef.current.find((b) => b.id === id);
      setBeacons((prev) => prev.filter((b) => b.id !== id));
      if (gone) onRemoteRemovalRef.current?.(gone, reason);
    };

    const unsubscribe = beaconApi.subscribe({
      onUpsert: (row) => {
        if (row.hidden_at) return remove(row.id, 'hidden');
        const before = beaconsRef.current.find((b) => b.id === row.id);
        if (before && (before.iqamah_time !== row.iqamah_time || before.latitude !== row.latitude || before.longitude !== row.longitude)) {
          onRemoteChangeRef.current?.(before, row);
        }
        setBeacons((prev) => {
          const index = prev.findIndex((b) => b.id === row.id);
          if (index === -1) return isInActiveWindow(row.iqamah_time) ? [...prev, row] : prev;
          const next = prev.slice();
          next[index] = row;
          return next;
        });
      },
      onDelete: (id) => remove(id, 'cancelled'),
      onResync: () => void refresh(),
    });

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [refresh]);

  /** Optimistically shows the pin, then swaps in the server row (or removes it on failure). */
  const createBeacon = useCallback(
    async (input: NewPrayer, repeat?: Repeat): Promise<Prayer> => {
      const tempId = `${PENDING_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const temp: Beacon = { ...input, id: tempId, attendee_count: 1, created_at: new Date().toISOString(), pending: true };
      setBeacons((prev) => [...prev, temp]);
      try {
        const { prayer, hostToken, regularId } = repeat
          ? await beaconApi.createRegular(input, repeat.days, repeat.timeZone)
          : { ...(await beaconApi.create(input)), regularId: null };
        // The realtime insert may already have added the real row.
        setBeacons((prev) => [...prev.filter((b) => b.id !== tempId && b.id !== prayer.id), prayer]);
        editMemberships((m) => {
          m[prayer.id] = { role: 'host', token: hostToken };
        });
        if (regularId) {
          setRegularHostsState(
            updateRegularHosts((h) => {
              h[regularId] = hostToken;
            }),
          );
        }
        return prayer;
      } catch (err) {
        setBeacons((prev) => prev.filter((b) => b.id !== tempId));
        throw err;
      }
    },
    [editMemberships],
  );

  const joinBeacon = useCallback(
    async (id: string): Promise<void> => {
      // localStorage is the source of truth, so a second tab can't double-count either.
      const beacon = beaconsRef.current.find((b) => b.id === id);
      if (isPendingId(id) || (beacon ? membershipFor(beacon) : getMemberships()[id])) return;

      editMemberships((m) => {
        m[id] = { role: 'attendee', token: null };
      });
      setCount(id, (c) => c + 1);
      try {
        const result = await beaconApi.join(id);
        if (!result) throw new Error("This jama'ah has already ended.");
        setCount(id, () => result.count);
        editMemberships((m) => {
          m[id] = { role: 'attendee', token: result.token };
        });
      } catch (err) {
        editMemberships((m) => {
          delete m[id];
        });
        setCount(id, (c) => c - 1);
        throw err;
      }
    },
    [editMemberships, setCount],
  );

  const leaveBeacon = useCallback(
    async (id: string): Promise<void> => {
      const membership = getMemberships()[id];
      if (membership?.role !== 'attendee' || !membership.token) return;

      editMemberships((m) => {
        delete m[id];
      });
      setCount(id, (c) => c - 1);
      try {
        const count = await beaconApi.leave(id, membership.token);
        if (count === null) throw new Error("Couldn't remove you. This jama'ah may have ended.");
        setCount(id, () => count);
      } catch (err) {
        editMemberships((m) => {
          m[id] = membership;
        });
        setCount(id, (c) => c + 1);
        throw err;
      }
    },
    [editMemberships, setCount],
  );

  const hostTokenFor = (id: string): string => {
    const beacon = beaconsRef.current.find((b) => b.id === id);
    const membership = beacon ? membershipFor(beacon) : getMemberships()[id];
    if (membership?.role !== 'host' || !membership.token) throw new Error("Only the host can change this jama'ah.");
    return membership.token;
  };

  /** Not optimistic: the host is waiting on the result anyway, and realtime tells everyone else. */
  const updateBeacon = useCallback(async (id: string, changes: PrayerChanges): Promise<Prayer> => {
    const updated = await beaconApi.update(id, hostTokenFor(id), changes);
    setBeacons((prev) => prev.map((b) => (b.id === id ? updated : b)));
    return updated;
  }, []);

  /** Stops future days; today's beacon stays until cancelled or over. */
  const stopRegular = useCallback(async (regularId: string): Promise<void> => {
    const token = getRegularHosts()[regularId];
    if (!token) throw new Error("Only the host can stop this regular jama'ah.");
    const stopped = await beaconApi.stopRegular(regularId, token);
    if (!stopped) throw new Error("Couldn't stop it. Please try again.");
    setBeacons((prev) => prev.map((b) => (b.regular_id === regularId ? { ...b, repeat_days: null } : b)));
  }, []);

  /** Not optimistic: cancelling is destructive, so wait for the server. */
  const cancelBeacon = useCallback(
    async (id: string): Promise<void> => {
      const deleted = await beaconApi.cancel(id, hostTokenFor(id));
      if (!deleted) throw new Error("Couldn't cancel. It may have already ended.");
      setBeacons((prev) => prev.filter((b) => b.id !== id));
      editMemberships((m) => {
        delete m[id];
      });
    },
    [editMemberships],
  );

  /** Hides the beacon on this device straight away, whatever the server decides. */
  const reportBeacon = useCallback(async (id: string, reason: ReportReason): Promise<void> => {
    await beaconApi.report(id, getDeviceId(), reason);
    setReported(addReported(id));
  }, []);

  const roleFor = useCallback(
    (beacon: Beacon): Membership | undefined => membershipFor(beacon, memberships, regularHosts),
    [memberships, regularHosts],
  );

  return {
    beacons,
    loadState,
    roleFor,
    refresh,
    createBeacon,
    updateBeacon,
    stopRegular,
    joinBeacon,
    leaveBeacon,
    cancelBeacon,
    reportBeacon,
  };
}
