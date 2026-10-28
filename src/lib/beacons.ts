import { addMinutes } from 'date-fns';
import { FALLBACK_CENTER, LOOKAHEAD_MINUTES, LOOKBACK_MINUTES } from './config';
import { supabase } from './supabase';
import type { NewPrayer, Prayer } from './types';

export interface BeaconApi {
  fetchActive(): Promise<Prayer[]>;
  create(input: NewPrayer): Promise<Prayer>;
  /** Returns the new attendee count, or null if the beacon has ended. */
  join(id: string): Promise<number | null>;
}

function activeWindow() {
  const now = new Date();
  return {
    from: addMinutes(now, -LOOKBACK_MINUTES).toISOString(),
    to: addMinutes(now, LOOKAHEAD_MINUTES).toISOString(),
  };
}

function createSupabaseApi(client: NonNullable<typeof supabase>): BeaconApi {
  return {
    async fetchActive() {
      const { from, to } = activeWindow();
      const { data, error } = await client
        .from('prayers')
        .select('*')
        .gte('iqamah_time', from)
        .lte('iqamah_time', to)
        .order('iqamah_time', { ascending: true });
      if (error) throw error;
      return data as Prayer[];
    },

    async create(input) {
      const { data, error } = await client.from('prayers').insert(input).select().single();
      if (error) throw error;
      return data as Prayer;
    },

    async join(id) {
      const { data, error } = await client.rpc('increment_attendee', { prayer_id: id });
      if (error) throw error;
      return data as number | null;
    },
  };
}

function createDemoApi(): BeaconApi {
  const [lat, lng] = FALLBACK_CENTER;
  const at = (minutes: number) => addMinutes(new Date(), minutes).toISOString();
  const rows: Prayer[] = [
    {
      id: 'demo-1',
      salah_name: 'Dhuhr',
      latitude: lat + 0.0041,
      longitude: lng + 0.0118,
      location_name: "King's College Strand, multi-faith room",
      location_notes: 'Ground floor, east wing. Follow the signs past the café.',
      iqamah_time: at(-3),
      sisters_friendly: true,
      wudu_nearby: true,
      attendee_count: 6,
      created_at: at(-20),
    },
    {
      id: 'demo-2',
      salah_name: 'Dhuhr',
      latitude: lat + 0.0006,
      longitude: lng + 0.0053,
      location_name: 'Victoria Embankment Gardens',
      location_notes: 'On the grass behind the bandstand. Look for the green prayer mats.',
      iqamah_time: at(8),
      sisters_friendly: false,
      wudu_nearby: false,
      attendee_count: 2,
      created_at: at(-5),
    },
    {
      id: 'demo-3',
      salah_name: 'Asr',
      latitude: lat + 0.0032,
      longitude: lng - 0.0012,
      location_name: 'Charing Cross Library, 2nd floor',
      location_notes: 'Quiet study room 2B, at the far end past the periodicals.',
      iqamah_time: at(95),
      sisters_friendly: true,
      wudu_nearby: true,
      attendee_count: 1,
      created_at: at(-1),
    },
  ];
  const latency = () => new Promise((resolve) => setTimeout(resolve, 300));

  return {
    async fetchActive() {
      await latency();
      const { from, to } = activeWindow();
      return rows
        .filter((r) => r.iqamah_time >= from && r.iqamah_time <= to)
        .sort((a, b) => a.iqamah_time.localeCompare(b.iqamah_time))
        .map((r) => ({ ...r }));
    },

    async create(input) {
      await latency();
      const row: Prayer = {
        ...input,
        id: `demo-${Date.now()}`,
        attendee_count: 1,
        created_at: new Date().toISOString(),
      };
      rows.push(row);
      return { ...row };
    },

    async join(id) {
      await latency();
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      row.attendee_count += 1;
      return row.attendee_count;
    },
  };
}

export const isDemoMode = supabase === null;
export const beaconApi: BeaconApi = supabase ? createSupabaseApi(supabase) : createDemoApi();
