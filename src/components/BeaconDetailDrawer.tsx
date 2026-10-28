import { Check, LoaderCircle, MapPin, Navigation, Users, X } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import { SALAH_COLORS } from '../lib/config';
import { distanceMeters, formatDistance, walkingDirectionsUrl } from '../lib/geo';
import { getStatus, msUntil } from '../lib/time';
import type { Beacon, Coords } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { CountdownTimer } from './CountdownTimer';
import { MetaBadges } from './MetaBadges';

const STARTING_NOW_MS = 2 * 60_000;

interface Props {
  beacon: Beacon | null;
  joined: boolean;
  joining: boolean;
  userLocation: Coords | null;
  onJoin: (id: string) => void;
  onClose: () => void;
}

export function BeaconDetailDrawer({ beacon, joined, joining, userLocation, onJoin, onClose }: Props) {
  const now = useNow(1000);

  return (
    <BottomSheet open={beacon !== null} onClose={onClose} labelledBy="beacon-title">
      {beacon && (
        <DrawerBody
          beacon={beacon}
          now={now}
          joined={joined}
          joining={joining}
          userLocation={userLocation}
          onJoin={onJoin}
          onClose={onClose}
        />
      )}
    </BottomSheet>
  );
}

function DrawerBody({ beacon, now, joined, joining, userLocation, onJoin, onClose }: Props & { beacon: Beacon; now: number }) {
  const status = getStatus(beacon.iqamah_time, now);
  const coords: Coords = [beacon.latitude, beacon.longitude];

  return (
    <div className="space-y-4 pt-1">
      <div className="flex items-start gap-3">
        <span
          className="mt-1 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: SALAH_COLORS[beacon.salah_name] }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="beacon-title" className="text-2xl font-bold text-slate-900">
              {beacon.salah_name}
            </h2>
            <StatusBadge status={status} startingNow={status === 'upcoming' && msUntil(beacon.iqamah_time, now) <= STARTING_NOW_MS} />
          </div>
          {userLocation && <p className="text-sm text-slate-500">{formatDistance(distanceMeters(userLocation, coords))}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <X className="size-5" />
        </button>
      </div>

      <CountdownTimer iqamahTime={beacon.iqamah_time} status={status} now={now} />

      <div className="flex gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold break-words text-slate-900">{beacon.location_name}</p>
          {beacon.location_notes && (
            <p className="mt-0.5 text-sm break-words whitespace-pre-line text-slate-600">{beacon.location_notes}</p>
          )}
        </div>
      </div>

      <MetaBadges sistersFriendly={beacon.sisters_friendly} wuduNearby={beacon.wudu_nearby} />

      <div className="flex items-center gap-2 text-slate-700">
        <Users className="size-5 text-slate-400" aria-hidden />
        <span>
          <strong className="text-slate-900">{beacon.attendee_count}</strong>{' '}
          {beacon.attendee_count === 1 ? 'person' : 'people'} attending
        </span>
      </div>

      <div className="flex gap-2">
        <JoinButton
          pending={Boolean(beacon.pending)}
          joined={joined}
          joining={joining}
          ended={status === 'ended'}
          onClick={() => onJoin(beacon.id)}
        />
        <a
          href={walkingDirectionsUrl(coords)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Walking directions"
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200"
        >
          <Navigation className="size-5" />
        </a>
      </div>
    </div>
  );
}

function StatusBadge({ status, startingNow }: { status: ReturnType<typeof getStatus>; startingNow: boolean }) {
  if (status === 'in_progress') {
    return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Praying now</span>;
  }
  if (status === 'ended') {
    return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Ended</span>;
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
      {startingNow && <span className="size-1.5 animate-pulse rounded-full bg-emerald-600" aria-hidden />}
      {startingNow ? 'Starting now' : 'Upcoming'}
    </span>
  );
}

interface JoinButtonProps {
  pending: boolean;
  joined: boolean;
  joining: boolean;
  ended: boolean;
  onClick: () => void;
}

function JoinButton({ pending, joined, joining, ended, onClick }: JoinButtonProps) {
  const base = 'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-semibold transition';

  if (joined) {
    return (
      <button type="button" disabled className={`${base} bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200`}>
        <Check className="size-5" strokeWidth={2.5} /> You're counted in!
      </button>
    );
  }
  const disabled = pending || joining || ended;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} bg-emerald-700 text-white hover:bg-emerald-800 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-500`}
    >
      {(pending || joining) && <LoaderCircle className="size-5 animate-spin" />}
      {pending ? 'Publishing…' : ended ? 'This jama’ah has ended' : 'Count me in (+1)'}
    </button>
  );
}
