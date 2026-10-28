import type { Coords } from './types';

const EARTH_RADIUS_M = 6_371_000;
const WALKING_M_PER_MIN = 80;

export function distanceMeters([lat1, lng1]: Coords, [lat2, lng2]: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function formatDistance(meters: number): string {
  const label = meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
  const minutes = Math.max(1, Math.round(meters / WALKING_M_PER_MIN));
  return `${label} · ~${minutes} min walk`;
}

export function walkingDirectionsUrl([lat, lng]: Coords): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
