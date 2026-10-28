export const SALAH_NAMES = ['Fajr', 'Dhuhr', 'Jumuah', 'Asr', 'Maghrib', 'Isha'] as const;
export type SalahName = (typeof SALAH_NAMES)[number];

/** [latitude, longitude] */
export type Coords = [number, number];

/** A row of public.prayers. */
export interface Prayer {
  id: string;
  salah_name: SalahName;
  latitude: number;
  longitude: number;
  location_name: string;
  location_notes: string | null;
  iqamah_time: string;
  sisters_friendly: boolean;
  wudu_nearby: boolean;
  attendee_count: number;
  created_at: string;
  /** Set once enough reports come in; hidden beacons are treated as removed. */
  hidden_at?: string | null;
}

export type NewPrayer = Pick<
  Prayer,
  | 'salah_name'
  | 'latitude'
  | 'longitude'
  | 'location_name'
  | 'location_notes'
  | 'iqamah_time'
  | 'sisters_friendly'
  | 'wudu_nearby'
>;

/** A prayer as held in client state; `pending` marks an optimistic insert not yet confirmed. */
export interface Beacon extends Prayer {
  pending?: boolean;
}
