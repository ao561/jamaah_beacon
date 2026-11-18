import { describe, expect, it } from 'vitest';
import { angleDiff, compassPoint, destinationPoint, distanceToKaabaKm, qiblaBearing } from './qibla';
import type { Coords } from './types';

const LONDON: Coords = [51.5074, -0.1278];

describe('qiblaBearing', () => {
  // Published great-circle qibla directions, degrees clockwise from true north.
  it.each([
    ['London', LONDON, 118.99],
    ['New York', [40.7128, -74.006] as Coords, 58.48],
    ['Sydney', [-33.8688, 151.2093] as Coords, 277.5],
    ['Jakarta', [-6.2088, 106.8456] as Coords, 295.15],
  ])('%s', (_, coords, expected) => {
    expect(Math.abs(qiblaBearing(coords) - expected)).toBeLessThan(0.1);
  });
});

describe('distanceToKaabaKm', () => {
  it('is about 4,790 km from London', () => {
    expect(Math.abs(distanceToKaabaKm(LONDON) - 4790)).toBeLessThan(20);
  });
});

describe('destinationPoint', () => {
  it('moves about one degree of latitude per 111 km north', () => {
    const [lat, lng] = destinationPoint(LONDON, 0, 111_195);
    expect(lat).toBeCloseTo(LONDON[0] + 1, 3);
    expect(lng).toBeCloseTo(LONDON[1], 6);
  });
});

describe('compassPoint', () => {
  it('names the nearest of 16 points', () => {
    expect(compassPoint(119)).toBe('east-southeast');
    expect(compassPoint(0)).toBe('north');
    expect(compassPoint(359)).toBe('north');
    expect(compassPoint(270)).toBe('west');
  });
});

describe('angleDiff', () => {
  it('takes the short way round', () => {
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(350, 10)).toBe(-20);
    expect(angleDiff(180, 0)).toBe(180);
  });
});
