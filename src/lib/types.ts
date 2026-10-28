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
  /** Set when the host edits the beacon. */
  updated_at?: string | null;
  /** The regular (weekly repeating) prayer this beacon was created from, if any. */
  regular_id?: string | null;
  /** Weekdays it repeats on (0 = Sunday); null once the host stops repeating. */
  repeat_days?: number[] | null;
  /** Null when there's no photo; changes whenever the photo does. */
  photo_updated_at?: string | null;
  /** The signed-in host's display name, if they chose to show it. */
  host_name?: string | null;
  /** Created by a signed-in host (confirmed email or Google), not anonymously. */
  host_verified?: boolean;
}

/** Fields a host can change after posting. */
export type PrayerChanges = Partial<NewPrayer>;

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
