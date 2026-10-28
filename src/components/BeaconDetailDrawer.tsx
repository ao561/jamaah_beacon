import { Check, Flag, LoaderCircle, MapPin, Navigation, Pencil, Repeat, Share2, Users, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNow } from '../hooks/useNow';
import { usePhoto } from '../hooks/usePhoto';
import { SALAH_COLORS, SALAH_LABELS } from '../lib/config';
import { distanceMeters, formatDistance, walkingDirectionsUrl } from '../lib/geo';
import type { Membership } from '../lib/memberships';
import { REPORT_REASONS, type ReportReason } from '../lib/reports';
import { formatClock, formatDays, getStatus, msUntil, type BeaconStatus } from '../lib/time';
import type { Beacon, Coords } from '../lib/types';
import { BottomSheet } from './BottomSheet';
import { CountdownTimer } from './CountdownTimer';
import { MetaBadges } from './MetaBadges';

const STARTING_NOW_MS = 2 * 60_000;
const CONFIRM_TIMEOUT_MS = 4000;

export type BeaconAction = 'join' | 'leave' | 'cancel' | 'report' | 'delay' | 'stop';

const DELAY_OPTIONS = [5, 10] as const;

interface Props {
  beacon: Beacon | null;
  membership: Membership | undefined;
  /** This device hosts the regular prayer the beacon came from, so it can stop future days. */
  hostsRegular: boolean;
  busy: BeaconAction | null;
  userLocation: Coords | null;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
  onCancel: (id: string) => void;
  onDelay: (beacon: Beacon, minutes: number) => void;
  onEdit: (beacon: Beacon) => void;
  onStopRegular: (regularId: string) => void;
  onShare: (beacon: Beacon) => void;
  onReport: (id: string, reason: ReportReason) => void;
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
  hostsRegular,
  busy,
  userLocation,
  onJoin,
  onLeave,
  onCancel,
  onDelay,
  onEdit,
  onStopRegular,
  onShare,
  onReport,
  onClose,
}: Omit<Props, 'beacon'> & { beacon: Beacon; now: number }) {
  const status = getStatus(beacon, now);
  const coords: Coords = [beacon.latitude, beacon.longitude];
  const isHost = membership?.role === 'host';
  const pending = Boolean(beacon.pending);
  const repeating = beacon.repeat_days && beacon.repeat_days.length > 0 ? beacon.repeat_days : null;

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
            <h2 id="beacon-title" className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {SALAH_LABELS[beacon.salah_name]}
            </h2>
            <StatusBadge status={status} startingNow={status === 'upcoming' && msUntil(beacon.iqamah_time, now) <= STARTING_NOW_MS} />
            {isHost && (
              <span className="rounded-full bg-slate-900 dark:bg-slate-100 dark:text-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">You're hosting</span>
            )}
            {repeating && (
              <span className="flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-950 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:text-violet-300">
                <Repeat className="size-3" aria-hidden /> Regular · {formatDays(repeating)}
              </span>
            )}
          </div>
          {userLocation && <p className="text-sm text-slate-500 dark:text-slate-400">{formatDistance(distanceMeters(userLocation, coords))}</p>}
          {beacon.updated_at && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Updated by the host at {formatClock(beacon.updated_at)}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 grid size-9 place-items-center rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X className="size-5" />
        </button>
      </div>

      <CountdownTimer iqamahTime={beacon.iqamah_time} salah={beacon.salah_name} status={status} now={now} />

      <div className="flex gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold break-words text-slate-900 dark:text-slate-100">{beacon.location_name}</p>
          {beacon.location_notes && (
            <p className="mt-0.5 text-sm break-words whitespace-pre-line text-slate-600 dark:text-slate-400">{beacon.location_notes}</p>
          )}
        </div>
      </div>

      {beacon.photo_updated_at && <SpotPhoto beacon={beacon} />}

      <MetaBadges sistersFriendly={beacon.sisters_friendly} wuduNearby={beacon.wudu_nearby} />

      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Users className="size-5 text-slate-400 dark:text-slate-500" aria-hidden />
        <span>
          <strong className="text-slate-900 dark:text-slate-100">{beacon.attendee_count}</strong>{' '}
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
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
        >
          <Navigation className="size-5" />
        </a>
      </div>

      {isHost && membership.token && !pending && (
        <div className="space-y-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3">
          {status !== 'ended' && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">Running late?</span>
              {DELAY_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  disabled={busy === 'delay'}
                  onClick={() => onDelay(beacon, minutes)}
                  className="rounded-full bg-white dark:bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  +{minutes} min
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onEdit(beacon)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-900 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <Pencil className="size-4" /> Edit details
          </button>
          <ConfirmTextButton
            label={repeating ? 'Cancel today only' : "Cancel this jama'ah"}
            confirmLabel="Tap again to cancel it for everyone"
            busy={busy === 'cancel'}
            tone="danger"
            onConfirm={() => onCancel(beacon.id)}
          />
          {repeating && hostsRegular && beacon.regular_id && (
            <ConfirmTextButton
              label="Stop repeating"
              confirmLabel="Tap again to stop future days"
              busy={busy === 'stop'}
              tone="danger"
              onConfirm={() => onStopRegular(beacon.regular_id!)}
            />
          )}
        </div>
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
      {!isHost && !pending && <ReportControl busy={busy === 'report'} onReport={(reason) => onReport(beacon.id, reason)} />}
    </div>
  );
}

function SpotPhoto({ beacon }: { beacon: Beacon }) {
  const src = usePhoto(beacon);
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      aria-label={expanded ? 'Shrink photo' : 'Enlarge photo'}
      className={`block w-full overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-800 ${expanded ? '' : 'h-44'}`}
    >
      {src ? (
        <img
          src={src}
          alt={`Photo of ${beacon.location_name}`}
          className={expanded ? 'max-h-[70dvh] w-full object-contain' : 'h-full w-full object-cover'}
        />
      ) : (
        <span className="grid h-44 place-items-center">
          <LoaderCircle className="size-5 animate-spin text-slate-400 dark:text-slate-500" />
        </span>
      )}
    </button>
  );
}

function ReportControl({ busy, onReport }: { busy: boolean; onReport: (reason: ReportReason) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <Flag className="size-3.5" /> Report this beacon
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-3" role="group" aria-label="Report reason">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">What's wrong with it?</p>
      {(Object.keys(REPORT_REASONS) as ReportReason[]).map((reason) => (
        <button
          key={reason}
          type="button"
          disabled={busy}
          onClick={() => onReport(reason)}
          className="w-full rounded-xl bg-white dark:bg-slate-900 px-3 py-2.5 text-left text-sm text-slate-800 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          {REPORT_REASONS[reason]}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} className="w-full py-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        Never mind
      </button>
    </div>
  );
}

function StatusBadge({ status, startingNow }: { status: BeaconStatus; startingNow: boolean }) {
  if (status === 'in_progress') {
    return <span className="rounded-full bg-amber-100 dark:bg-amber-900/50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">Praying now</span>;
  }
  if (status === 'ended') {
    return <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Ended</span>;
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
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
      className={`${PRIMARY_CLASSES} bg-emerald-700 text-white hover:bg-emerald-800 active:scale-[0.98] disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-500 dark:disabled:text-slate-400`}
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
      className="grid size-14 shrink-0 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
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
      <button type="button" disabled className={`${PRIMARY_CLASSES} bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800`}>
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
        : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50'
      : armed
        ? 'bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white'
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700';

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
