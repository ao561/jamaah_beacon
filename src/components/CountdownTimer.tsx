import { formatClock, formatCountdown, msUntil, type BeaconStatus } from '../lib/time';

interface Props {
  iqamahTime: string;
  status: BeaconStatus;
  now: number;
}

export function CountdownTimer({ iqamahTime, status, now }: Props) {
  const remaining = msUntil(iqamahTime, now);
  const tone =
    status === 'upcoming' ? 'bg-emerald-50 text-emerald-800' : status === 'in_progress' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500';

  return (
    <div className={`flex items-end justify-between rounded-2xl px-4 py-3 ${tone}`}>
      <div>
        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
          {status === 'upcoming' ? 'Starts in' : status === 'in_progress' ? 'Praying now · started' : 'Ended'}
        </p>
        {status !== 'ended' && (
          <p className="font-mono text-4xl leading-tight font-bold tabular-nums" role="timer">
            {formatCountdown(remaining)}
            {status === 'in_progress' && <span className="ml-1 font-sans text-base font-semibold"> ago</span>}
          </p>
        )}
      </div>
      <p className="pb-1 text-sm font-medium">Iqamah {formatClock(iqamahTime)}</p>
    </div>
  );
}
