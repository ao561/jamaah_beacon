import { Compass, MapIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useCompass } from '../hooks/useCompass';
import { getPlatform } from '../lib/install';
import { angleDiff, compassPoint, distanceToKaabaKm, qiblaBearing } from '../lib/qibla';
import type { Coords } from '../lib/types';

const ALIGNED_DEG = 5;

interface Props {
  coords: Coords;
  showingOnMap: boolean;
  onToggleMap: () => void;
}

export function QiblaCard({ coords, showingOnMap, onToggleMap }: Props) {
  const bearing = qiblaBearing(coords);
  const compass = useCompass();
  const live = compass.status === 'on' && compass.heading !== null;
  // Phones only: laptops don't have a compass.
  const canUseCompass = getPlatform() !== 'desktop';

  const offBy = live ? angleDiff(bearing, compass.heading!) : null;
  const aligned = offBy !== null && Math.abs(offBy) <= ALIGNED_DEG;

  // A short buzz on lining up, once per alignment.
  const wasAligned = useRef(false);
  useEffect(() => {
    if (aligned && !wasAligned.current) navigator.vibrate?.(40);
    wasAligned.current = aligned;
  }, [aligned]);

  // Turn the sensor off when this card goes away.
  const { stop } = compass;
  useEffect(() => stop, [stop]);

  return (
    <div
      className={`rounded-2xl p-3 transition ${
        aligned ? 'bg-emerald-50 ring-2 ring-emerald-500 dark:bg-emerald-950/60' : 'bg-slate-50 dark:bg-slate-800/60'
      }`}
    >
      <div className="flex items-center gap-3">
        <Dial bearing={bearing} heading={live ? compass.heading : null} aligned={aligned} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Qibla</p>
          {live ? (
            <p className={`font-semibold ${aligned ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-100'}`}>
              {aligned
                ? "You're facing the qibla"
                : `Turn ${offBy! > 0 ? 'right' : 'left'} ${Math.round(Math.abs(offBy!))}°`}
            </p>
          ) : (
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {Math.round(bearing)}° from north
              <span className="font-normal text-slate-600 dark:text-slate-400"> · {compassPoint(bearing)}</span>
            </p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {Math.round(distanceToKaabaKm(coords)).toLocaleString()} km to Makkah
          </p>
        </div>
      </div>

      {live && compass.poorAccuracy && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          Compass accuracy is low. Move your phone in a figure-8 to calibrate, away from metal and electronics.
        </p>
      )}
      {compass.status === 'denied' && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Compass access was blocked. Allow motion &amp; orientation access for this site in your browser settings.
        </p>
      )}
      {compass.status === 'unsupported' && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          This device doesn't report a compass heading. Use the line on the map instead.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onToggleMap}
          aria-pressed={showingOnMap}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold ring-1 ${
            showingOnMap
              ? 'bg-emerald-700 text-white ring-emerald-700'
              : 'bg-white text-slate-800 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800'
          }`}
        >
          <MapIcon className="size-4" /> {showingOnMap ? 'Showing on map' : 'Show on map'}
        </button>
        {canUseCompass && (
          <button
            type="button"
            disabled={compass.status === 'asking'}
            onClick={() => (compass.status === 'on' || compass.status === 'starting' ? compass.stop() : void compass.start())}
            aria-pressed={live}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold ring-1 ${
              live
                ? 'bg-emerald-700 text-white ring-emerald-700'
                : 'bg-white text-slate-800 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800'
            }`}
          >
            <Compass className="size-4" />
            {compass.status === 'asking'
              ? 'Allow compass…'
              : compass.status === 'starting'
                ? 'Starting…'
                : live
                  ? 'Stop compass'
                  : 'Use compass'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A compass dial. Static: north up, needle at the qibla bearing. Live: the dial turns so its
 * N tracks real north, so the needle always points at the qibla in the real world.
 */
function Dial({ bearing, heading, aligned }: { bearing: number; heading: number | null; aligned: boolean }) {
  const rotation = heading === null ? 0 : -heading;
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-16 shrink-0"
      role="img"
      aria-label={`Qibla is ${Math.round(bearing)} degrees from north`}
    >
      <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '32px 32px', transition: 'transform 120ms linear' }}>
        <circle cx="32" cy="32" r="30" className="fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-600" strokeWidth="2" />
        {[0, 90, 180, 270].map((a) => (
          <line
            key={a}
            x1="32"
            y1="4"
            x2="32"
            y2="9"
            className="stroke-slate-400"
            strokeWidth="2"
            transform={`rotate(${a} 32 32)`}
          />
        ))}
        <text x="32" y="17" textAnchor="middle" className="fill-rose-600 text-[9px] font-bold">
          N
        </text>
        <g transform={`rotate(${bearing} 32 32)`}>
          <path
            d="M32 9 L37 33 L32 30 L27 33 Z"
            className={aligned ? 'fill-emerald-600' : 'fill-emerald-700 dark:fill-emerald-400'}
          />
          <circle cx="32" cy="32" r="3" className="fill-slate-700 dark:fill-slate-300" />
        </g>
      </g>
    </svg>
  );
}
