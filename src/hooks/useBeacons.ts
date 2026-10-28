import { useCallback, useEffect, useState } from 'react';
import { beaconApi } from '../lib/beacons';
import { REFRESH_INTERVAL_MS } from '../lib/config';
import { getJoined, setJoined } from '../lib/joined';
import type { Beacon, NewPrayer, Prayer } from '../lib/types';

export type LoadState = 'loading' | 'ready' | 'error';

const PENDING_PREFIX = 'pending-';

export const isPendingId = (id: string) => id.startsWith(PENDING_PREFIX);

function updateJoined(update: (ids: Set<string>) => void): Set<string> {
  const ids = getJoined();
  update(ids);
  setJoined(ids);
  return ids;
}

export function useBeacons() {
  const [beacons, setBeacons] = useState<Beacon[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [joined, setJoinedState] = useState<Set<string>>(getJoined);

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
        setJoinedState(getJoined());
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  /** Optimistically shows the pin, then swaps in the server row (or removes it on failure). */
  const createBeacon = useCallback(async (input: NewPrayer): Promise<Prayer> => {
    const tempId = `${PENDING_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const temp: Beacon = { ...input, id: tempId, attendee_count: 1, created_at: new Date().toISOString(), pending: true };
    setBeacons((prev) => [...prev, temp]);
    try {
      const row = await beaconApi.create(input);
      setBeacons((prev) => [...prev.filter((b) => b.id !== tempId && b.id !== row.id), row]);
      // The host is already the first attendee.
      setJoinedState(updateJoined((ids) => ids.add(row.id)));
      return row;
    } catch (err) {
      setBeacons((prev) => prev.filter((b) => b.id !== tempId));
      throw err;
    }
  }, []);

  const joinBeacon = useCallback(async (id: string): Promise<void> => {
    // localStorage is the source of truth, so a second tab can't double-count either.
    if (isPendingId(id) || getJoined().has(id)) return;

    const bump = (delta: number) =>
      setBeacons((prev) => prev.map((b) => (b.id === id ? { ...b, attendee_count: b.attendee_count + delta } : b)));

    setJoinedState(updateJoined((ids) => ids.add(id)));
    bump(1);
    try {
      const count = await beaconApi.join(id);
      if (count === null) throw new Error("This jama'ah has already ended.");
      setBeacons((prev) => prev.map((b) => (b.id === id ? { ...b, attendee_count: count } : b)));
    } catch (err) {
      setJoinedState(updateJoined((ids) => ids.delete(id)));
      bump(-1);
      throw err;
    }
  }, []);

  return { beacons, loadState, joined, refresh, createBeacon, joinBeacon };
}
