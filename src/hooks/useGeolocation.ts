import { useEffect, useState } from 'react';
import type { Coords } from '../lib/types';

export type GeoStatus = 'pending' | 'granted' | 'denied' | 'unavailable';

export interface GeoState {
  status: GeoStatus;
  coords: Coords | null;
  /** Reported GPS accuracy radius in metres. */
  accuracy: number | null;
}

const PERMISSION_DENIED = 1;

/**
 * Watches the device position once `enabled` (held back during the welcome, so the
 * permission prompt doesn't land on top of it). Never throws; failures surface as
 * `denied` / `unavailable`.
 */
export function useGeolocation(enabled = true): GeoState {
  const [state, setState] = useState<GeoState>({ status: 'pending', coords: null, accuracy: null });

  useEffect(() => {
    if (!enabled) return;
    // Geolocation needs a secure context (https or localhost).
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      setState({ status: 'unavailable', coords: null, accuracy: null });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setState({
          status: 'granted',
          coords: [pos.coords.latitude, pos.coords.longitude],
          accuracy: pos.coords.accuracy,
        }),
      (err) =>
        // A transient error after a good fix shouldn't throw away the last known position.
        setState((prev) =>
          prev.coords
            ? prev
            : { status: err.code === PERMISSION_DENIED ? 'denied' : 'unavailable', coords: null, accuracy: null },
        ),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return state;
}
