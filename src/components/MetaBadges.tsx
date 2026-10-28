import type { ReactNode } from 'react';
import { Droplets, Users } from 'lucide-react';

interface Props {
  sistersFriendly: boolean;
  wuduNearby: boolean;
}

export function MetaBadges({ sistersFriendly, wuduNearby }: Props) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Amenities">
      <Badge on={sistersFriendly} icon={<Users className="size-4" />} label="Sisters' space" />
      <Badge on={wuduNearby} icon={<Droplets className="size-4" />} label="Wudu nearby" />
    </ul>
  );
}

function Badge({ on, icon, label }: { on: boolean; icon: ReactNode; label: string }) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
        on ? 'bg-sky-50 text-sky-800 ring-1 ring-sky-200' : 'bg-slate-50 text-slate-400 line-through ring-1 ring-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span className="sr-only">{on ? 'available' : 'not available'}</span>
    </li>
  );
}
