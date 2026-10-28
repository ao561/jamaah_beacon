import { Check, LoaderCircle, MapPin, Navigation, Share2, Users, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import { SALAH_COLORS } from '../lib/config';
import { distanceMeters, formatDistance, walkingDirectionsUrl } from '../lib/geo';
import type { Membership } from '../lib/memberships';
import { getStatus, msUntil, type BeaconStatus } from '../lib/time';
import type { Beacon, Coords } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { CountdownTimer } from './CountdownTimer';
import { MetaBadges } from './MetaBadges';

const STARTING_NOW_MS = 2 * 60_000;
const CONFIRM_TIMEOUT_MS = 4000;

export type BeaconAction = 'join' | 'leave' | 'cancel';

interface Props {
  beacon: Beacon | null;
  membership: Membership | undefined;
  busy: BeaconAction | null;
  userLocation: Coords | null;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
  onCancel: (id: string) => void;
  onShare: (beacon: Beacon) => void;
  onClose: () => void;
}

export function BeaconDetailDrawer({ beacon, ...rest }: Props) {
  const now = useNow(1000);

  return (
    <BottomSheet open={beacon !== null} onClose={rest.onClose} labelledBy="beacon-title">
      {beacon && <DrawerBody key={beacon.id} beacon={beacon} now={now} {...rest} />}
    </BottomSheet>
  );
}

function DrawerBody({
  beacon,
  now,
  membership,
  busy,
  userLocation,
  onJoin,
  onLeave,
  onCancel,
  onShare,
  onClose,
}: Omit<Props, 'beacon'> & { beacon: Beacon; now: number }) {
  const status = getStatus(beacon.iqamah_time, now);
  const coords: Coords = [beacon.latitude, beacon.longitude];
  const isHost = membership?.role === 'host';
  const pending = Boolean(beacon.pending);

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
            {isHost && (
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">You're hosting</span>
            )}
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
        {isHost ? (
          <PrimaryButton onClick={() => onShare(beacon)}>
            <Share2 className="size-5" /> Invite people
          </PrimaryButton>
        ) : (
          <>
            <JoinButton
              pending={pending}
              joined={membership !== undefined}
              joining={busy === 'join'}
              ended={status === 'ended'}
              onClick={() => onJoin(beacon.id)}
            />
            <IconButton label="Share" disabled={pending} onClick={() => onShare(beacon)}>
              <Share2 className="size-5" />
            </IconButton>
          </>
        )}
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

      {isHost && membership.token && (
        <ConfirmTextButton
          label="Cancel this jama'ah"
          confirmLabel="Tap again to cancel it for everyone"
          busy={busy === 'cancel'}
          tone="danger"
          onConfirm={() => onCancel(beacon.id)}
        />
      )}
      {membership?.role === 'attendee' && membership.token && (
        <ConfirmTextButton
          label="Can't make it? Remove me"
          confirmLabel="Tap again to remove your +1"
          busy={busy === 'leave'}
          tone="neutral"
          onConfirm={() => onLeave(beacon.id)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, startingNow }: { status: BeaconStatus; startingNow: boolean }) {
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

const PRIMARY_CLASSES = 'flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-semibold transition';

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${PRIMARY_CLASSES} bg-emerald-700 text-white hover:bg-emerald-800 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-500`}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-14 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
    >
      {children}
    </button>
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
  if (joined && !joining) {
    return (
      <button type="button" disabled className={`${PRIMARY_CLASSES} bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200`}>
        <Check className="size-5" strokeWidth={2.5} /> You're counted in!
      </button>
    );
  }
  return (
    <PrimaryButton onClick={onClick} disabled={pending || joining || ended}>
      {(pending || joining) && <LoaderCircle className="size-5 animate-spin" />}
      {pending ? 'Publishing…' : ended ? 'This jama’ah has ended' : 'Count me in (+1)'}
    </PrimaryButton>
  );
}

/** A quiet text button that needs a second tap within a few seconds to fire. */
function ConfirmTextButton({
  label,
  confirmLabel,
  busy,
  tone,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  busy: boolean;
  tone: 'danger' | 'neutral';
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [armed]);

  const color =
    tone === 'danger'
      ? armed
        ? 'bg-rose-600 text-white'
        : 'text-rose-700 hover:bg-rose-50'
      : armed
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:bg-slate-100';

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
      className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${color}`}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" />}
      {armed ? confirmLabel : label}
    </button>
  );
}
