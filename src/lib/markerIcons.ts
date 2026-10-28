import L from 'leaflet';
import { SALAH_COLORS } from './config';
import type { BeaconStatus } from './time';
import type { SalahName } from './types';

// Pin geometry: a 34px square with three rounded corners, rotated -45deg so the sharp
// corner points down. That tip sits 17 + 17*sqrt(2) ≈ 41px below the box's top edge.
const PIN_SIZE: L.PointTuple = [34, 34];
const PIN_ANCHOR: L.PointTuple = [17, 41];

interface BeaconIconOptions {
  salah: SalahName;
  status: BeaconStatus;
  count: number;
  selected: boolean;
  pending: boolean;
  confirm: boolean;
}

// Icons are cached by their visual state so react-leaflet doesn't rebuild DOM on every tick.
const cache = new Map<string, L.DivIcon>();

export function beaconIcon(o: BeaconIconOptions): L.DivIcon {
  const key = `${o.salah}|${o.status}|${o.count}|${o.selected}|${o.pending}|${o.confirm}`;
  let icon = cache.get(key);
  if (!icon) {
    const classes = ['beacon-pin', o.selected && 'selected', o.pending && 'pending'].filter(Boolean).join(' ');
    const ring =
      o.status === 'in_progress'
        ? '<span class="beacon-ring live"></span>'
        : o.confirm
          ? '<span class="beacon-ring confirm"></span>'
          : '';
    icon = L.divIcon({
      className: 'beacon-icon',
      iconSize: PIN_SIZE,
      iconAnchor: PIN_ANCHOR,
      html: `<div class="beacon-wrap" style="--pin:${SALAH_COLORS[o.salah]}">
        ${ring}
        <div class="${classes}"><span>${o.salah[0]}</span></div>
        <span class="beacon-count">${o.count}</span>
      </div>`,
    });
    cache.set(key, icon);
  }
  return icon;
}

export const draftIcon = L.divIcon({
  className: 'beacon-icon',
  iconSize: PIN_SIZE,
  iconAnchor: PIN_ANCHOR,
  html: `<div class="beacon-wrap" style="--pin:#111827">
    <span class="beacon-ring confirm infinite"></span>
    <div class="beacon-pin draft"><span>+</span></div>
  </div>`,
});

export const userIcon = L.divIcon({
  className: 'beacon-icon',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: '<div class="user-dot"></div>',
});
