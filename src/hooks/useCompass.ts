import { useCallback, useEffect, useRef, useState } from 'react';

// Live device heading (degrees clockwise from north) from the phone's magnetometer.
// iOS Safari: `deviceorientation` with webkitCompassHeading, after an explicit permission
// prompt that must come from a tap. Android Chrome: `deviceorientationabsolute`, whose alpha
// is counter-clockwise from north. Laptops have no compass, so readings never arrive.

/** 'asking': the browser's motion-permission prompt is showing (iOS, and some Chrome versions). */
export type CompassStatus = 'off' | 'asking' | 'starting' | 'on' | 'denied' | 'unsupported';

interface OrientationWithCompass extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied'> };

const NO_READING_TIMEOUT_MS = 2500;
const SMOOTHING = 0.25; // 0..1; lower is smoother but laggier
const POOR_ACCURACY_DEG = 25;

export function useCompass() {
  const [status, setStatus] = useState<CompassStatus>('off');
  const [heading, setHeading] = useState<number | null>(null);
  const [poorAccuracy, setPoorAccuracy] = useState(false);
  const smoothed = useRef<number | null>(null);

  const start = useCallback(async () => {
    if (typeof DeviceOrientationEvent === 'undefined') return setStatus('unsupported');
    const api = DeviceOrientationEvent as unknown as PermissionApi;
    if (api.requestPermission) {
      setStatus('asking');
      try {
        if ((await api.requestPermission()) !== 'granted') return setStatus('denied');
      } catch {
        return setStatus('denied');
      }
    }
    smoothed.current = null;
    setHeading(null);
    setStatus('starting');
  }, []);

  const stop = useCallback(() => {
    setStatus('off');
    setHeading(null);
  }, []);

  // Listeners stay attached across 'starting' -> 'on'; only turning off detaches them.
  const active = status === 'starting' || status === 'on';

  useEffect(() => {
    if (!active) return;

    const onReading = (raw: number) => {
      // Correct for the screen being rotated (landscape).
      const screenAngle = screen.orientation?.angle ?? 0;
      const value = (raw + screenAngle + 360) % 360;
      // Smooth along the shortest arc so 359° -> 1° doesn't swing through 180°.
      const prev = smoothed.current;
      const next = prev === null ? value : (prev + (((value - prev + 540) % 360) - 180) * SMOOTHING + 360) % 360;
      smoothed.current = next;
      setHeading(next);
      setStatus('on');
    };

    const onIos = (e: Event) => {
      const ev = e as OrientationWithCompass;
      if (typeof ev.webkitCompassHeading !== 'number') return;
      setPoorAccuracy(typeof ev.webkitCompassAccuracy === 'number' && (ev.webkitCompassAccuracy < 0 || ev.webkitCompassAccuracy > POOR_ACCURACY_DEG));
      onReading(ev.webkitCompassHeading);
    };
    const onAbsolute = (e: Event) => {
      const ev = e as DeviceOrientationEvent;
      if (ev.alpha === null) return;
      onReading(360 - ev.alpha);
    };

    window.addEventListener('deviceorientation', onIos);
    window.addEventListener('deviceorientationabsolute', onAbsolute);
    const timeout = setTimeout(() => {
      if (smoothed.current === null) setStatus('unsupported');
    }, NO_READING_TIMEOUT_MS);

    return () => {
      window.removeEventListener('deviceorientation', onIos);
      window.removeEventListener('deviceorientationabsolute', onAbsolute);
      clearTimeout(timeout);
    };
  }, [active]);

  return { status, heading, poorAccuracy, start, stop };
}
