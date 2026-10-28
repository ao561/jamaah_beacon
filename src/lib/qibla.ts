import type { Coords } from './types';

// The Kaaba, Makkah.
const KAABA: Coords = [21.422487, 39.826206];
const EARTH_RADIUS_M = 6_371_000;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const normalise = (d: number) => ((d % 360) + 360) % 360;

/** Great-circle initial bearing from `from` to the Kaaba, in degrees clockwise from true north. */
export function qiblaBearing([lat, lng]: Coords): number {
  const φ1 = rad(lat);
  const φ2 = rad(KAABA[0]);
  const Δλ = rad(KAABA[1] - lng);
  return normalise(deg(Math.atan2(Math.sin(Δλ), Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ))));
}

export function distanceToKaabaKm([lat, lng]: Coords): number {
  const φ1 = rad(lat);
  const φ2 = rad(KAABA[0]);
  const a = Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(rad(KAABA[1] - lng) / 2) ** 2;
  return (2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))) / 1000;
}

/** The point `meters` away from `from` along `bearing` (for drawing the qibla line). */
export function destinationPoint([lat, lng]: Coords, bearing: number, meters: number): Coords {
  const δ = meters / EARTH_RADIUS_M;
  const θ = rad(bearing);
  const φ1 = rad(lat);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = rad(lng) + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [deg(φ2), normalise(deg(λ2) + 180) - 180];
}

const POINTS = [
  'north', 'north-northeast', 'northeast', 'east-northeast',
  'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest',
  'west', 'west-northwest', 'northwest', 'north-northwest',
];

/** 119 -> "east-southeast" */
export function compassPoint(bearing: number): string {
  return POINTS[Math.round(normalise(bearing) / 22.5) % 16];
}

/** Signed smallest difference a - b, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = normalise(a - b);
  return d > 180 ? d - 360 : d;
}
