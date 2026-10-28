import { useCallback, useEffect, useRef, useState } from 'react';
import { beaconApi, isInActiveWindow } from '../lib/beacons';
import { REFRESH_INTERVAL_MS } from '../lib/config';
import { getMemberships, updateMemberships, type Memberships } from '../lib/memberships';
import type { Beacon, NewPrayer, Prayer } from '../lib/types';

export type LoadState = 'loading' | 'ready' | 'error';

const PENDING_PREFIX = 'pending-';

export const isPendingId = (id: string) => id.startsWith(PENDING_PREFIX);

interface Options {
  /** A beacon disappeared because someone (possibly this device) cancelled it. */
  onRemoteDelete?: (beacon: Beacon) => void;
}

export function useBeacons({ onRemoteDelete }: Options = {}) {
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [memberships, setMembershipsState] = useState<Memberships>(getMemberships);

  const beaconsRef = useRef(beacons);
  beaconsRef.current = beacons;
  const onRemoteDeleteRef = useRef(onRemoteDelete);
  onRemoteDeleteRef.current = onRemoteDelete;

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
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const unsubscribe = beaconApi.subscribe({
      onUpsert: (row) =>
        setBeacons((prev) => {
          const index = prev.findIndex((b) => b.id === row.id);
          if (index === -1) return isInActiveWindow(row.iqamah_time) ? [...prev, row] : prev;
          const next = prev.slice();
          next[index] = row;
          return next;
        }),
      onDelete: (deletedId) => {
        const gone = beaconsRef.current.find((b) => b.id === deletedId);
        setBeacons((prev) => prev.filter((b) => b.id !== deletedId));
        if (gone) onRemoteDeleteRef.current?.(gone);
      },
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
    async (input: NewPrayer): Promise<Prayer> => {
      const tempId = `${PENDING_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const temp: Beacon = { ...input, id: tempId, attendee_count: 1, created_at: new Date().toISOString(), pending: true };
      setBeacons((prev) => [...prev, temp]);
      try {
        const { prayer, hostToken } = await beaconApi.create(input);
        // The realtime insert may already have added the real row.
        setBeacons((prev) => [...prev.filter((b) => b.id !== tempId && b.id !== prayer.id), prayer]);
        editMemberships((m) => {
          m[prayer.id] = { role: 'host', token: hostToken };
        });
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
      if (isPendingId(id) || getMemberships()[id]) return;

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

  /** Not optimistic: cancelling is destructive, so wait for the server. */
  const cancelBeacon = useCallback(
    async (id: string): Promise<void> => {
      const membership = getMemberships()[id];
      if (membership?.role !== 'host' || !membership.token) throw new Error("Only the host can cancel this jama'ah.");

      const deleted = await beaconApi.cancel(id, membership.token);
      if (!deleted) throw new Error("Couldn't cancel. It may have already ended.");
      setBeacons((prev) => prev.filter((b) => b.id !== id));
      editMemberships((m) => {
        delete m[id];
      });
    },
    [editMemberships],
  );

  return { beacons, loadState, memberships, refresh, createBeacon, joinBeacon, leaveBeacon, cancelBeacon };
}
