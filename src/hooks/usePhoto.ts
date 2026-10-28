import { useEffect, useState } from 'react';
import { beaconApi } from '../lib/beacons';
import type { Prayer } from '../lib/types';

// Keyed by id and photo version, so a replaced photo is fetched again but reopening a
// beacon isn't.
const cache = new Map<string, Promise<string | null>>();

/** The beacon's photo as a data: URL, or null while loading / when there isn't one. */
export function usePhoto(beacon: Pick<Prayer, 'id' | 'photo_updated_at'> | null | undefined): string | null {
  const key = beacon?.photo_updated_at ? `${beacon.id}|${beacon.photo_updated_at}` : null;
  const [src, setSrc] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!key || !beacon) return;
    let request = cache.get(key);
    if (!request) {
      request = beaconApi.getPhoto(beacon.id).catch((err) => {
        console.error('Failed to load photo', err);
        cache.delete(key);
        return null;
      });
      cache.set(key, request);
    }
    let live = true;
    void request.then((url) => live && setSrc({ key, url }));
    return () => {
      live = false;
    };
    // `key` already encodes the beacon id and photo version.
  }, [key]);

  return key && src?.key === key ? src.url : null;
}
