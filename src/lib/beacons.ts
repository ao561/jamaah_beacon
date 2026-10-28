import { addMinutes } from 'date-fns';
import { FALLBACK_CENTER, LOOKAHEAD_MINUTES, LOOKBACK_MINUTES } from './config';
import type { ReportReason } from './reports';
import { supabase } from './supabase';
import type { NewPrayer, Prayer, PrayerChanges } from './types';

export interface ChangeHandlers {
  onUpsert: (row: Prayer) => void;
  onDelete: (id: string) => void;
  /** Fired on every (re)connect: events may have been missed, so refetch. */
  onResync: () => void;
}

export interface BeaconApi {
  fetchActive(): Promise<Prayer[]>;
  create(input: NewPrayer): Promise<{ prayer: Prayer; hostToken: string }>;
  /** Creates today's beacon and a weekly template that repeats it on `days` (0 = Sunday). */
  createRegular(
    input: NewPrayer,
    days: number[],
    timeZone: string,
  ): Promise<{ prayer: Prayer; hostToken: string; regularId: string }>;
  /** Host-only; returns the updated beacon. */
  update(id: string, token: string, changes: PrayerChanges): Promise<Prayer>;
  /** Host-only; stops future days of a regular prayer. */
  stopRegular(regularId: string, token: string): Promise<boolean>;
  /** Returns null if the beacon has ended. */
  join(id: string): Promise<{ count: number; token: string } | null>;
  /** Returns the new count, or null if the token was not accepted. */
  leave(id: string, token: string): Promise<number | null>;
  /** Returns whether the beacon was deleted. */
  cancel(id: string, token: string): Promise<boolean>;
  /** Returns whether this report pushed the beacon over the hide threshold. */
  report(id: string, deviceId: string, reason: ReportReason): Promise<boolean>;
  /** Live changes; returns an unsubscribe function. */
  subscribe(handlers: ChangeHandlers): () => void;
}

function activeWindow() {
  const now = new Date();
  return {
    from: addMinutes(now, -LOOKBACK_MINUTES).toISOString(),
    to: addMinutes(now, LOOKAHEAD_MINUTES).toISOString(),
  };
}

export function isInActiveWindow(iqamahTime: string): boolean {
  const { from, to } = activeWindow();
  const t = new Date(iqamahTime).getTime();
  return t >= new Date(from).getTime() && t <= new Date(to).getTime();
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
        .is('hidden_at', null)
        .order('iqamah_time', { ascending: true });
      if (error) throw error;
      return data as Prayer[];
    },

    async create(input) {
      const { data, error } = await client.rpc('create_prayer', { beacon: input });
      if (error) throw error;
      const { prayer, host_token } = data as { prayer: Prayer; host_token: string };
      return { prayer, hostToken: host_token };
    },

    async createRegular(input, days, timeZone) {
      const { data, error } = await client.rpc('create_regular_prayer', { beacon: input, days, tz: timeZone });
      if (error) throw error;
      const { prayer, host_token, regular_id } = data as { prayer: Prayer; host_token: string; regular_id: string };
      return { prayer, hostToken: host_token, regularId: regular_id };
    },

    async update(id, token, changes) {
      const { data, error } = await client.rpc('update_prayer', { prayer_id: id, token, changes });
      if (error) throw error;
      return data as Prayer;
    },

    async stopRegular(regularId, token) {
      const { data, error } = await client.rpc('stop_regular_prayer', { regular_id: regularId, token });
      if (error) throw error;
      return data === true;
    },

    async join(id) {
      const { data, error } = await client.rpc('join_prayer', { prayer_id: id });
      if (error) throw error;
      if (!data) return null;
      const { attendee_count, token } = data as { attendee_count: number; token: string };
      return { count: attendee_count, token };
    },

    async leave(id, token) {
      const { data, error } = await client.rpc('leave_prayer', { prayer_id: id, token });
      if (error) throw error;
      return data as number | null;
    },

    async cancel(id, token) {
      const { data, error } = await client.rpc('cancel_prayer', { prayer_id: id, token });
      if (error) throw error;
      return data === true;
    },

    async report(id, deviceId, reason) {
      const { data, error } = await client.rpc('report_prayer', { prayer_id: id, device_id: deviceId, reason });
      if (error) throw error;
      return data === true;
    },

    subscribe({ onUpsert, onDelete, onResync }) {
      // Unique topic: StrictMode remounts would otherwise reuse a channel that's still closing.
      const channel = client
        .channel(`prayers-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prayers' }, (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as Partial<Prayer>).id;
            if (id) onDelete(id);
          } else {
            onUpsert(payload.new as Prayer);
          }
        })
        .subscribe((status) => status === 'SUBSCRIBED' && onResync());
      return () => void client.removeChannel(channel);
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
  const tokens = new Map<string, { id: string; role: 'host' | 'attendee' }>();
  const regularTokens = new Map<string, string>(); // regular id -> host token
  const isHost = (id: string, token: string) => {
    const row = rows.find((r) => r.id === id);
    const issued = tokens.get(token);
    return (issued?.id === id && issued.role === 'host') || (!!row?.regular_id && regularTokens.get(row.regular_id) === token);
  };
  const issueToken = (id: string, role: 'host' | 'attendee') => {
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    tokens.set(token, { id, role });
    return token;
  };
  const latency = () => new Promise((resolve) => setTimeout(resolve, 300));

  return {
    async fetchActive() {
      await latency();
      return rows
        .filter((r) => isInActiveWindow(r.iqamah_time))
        .sort((a, b) => a.iqamah_time.localeCompare(b.iqamah_time))
        .map((r) => ({ ...r }));
    },

    async create(input) {
      await latency();
      const row: Prayer = { ...input, id: `demo-${Date.now()}`, attendee_count: 1, created_at: new Date().toISOString() };
      rows.push(row);
      return { prayer: { ...row }, hostToken: issueToken(row.id, 'host') };
    },

    async createRegular(input, days, timeZone) {
      const { prayer, hostToken } = await this.create(input);
      void timeZone; // The demo doesn't schedule future days.
      const regularId = `demo-regular-${Date.now()}`;
      regularTokens.set(regularId, hostToken);
      const row = rows.find((r) => r.id === prayer.id)!;
      Object.assign(row, { regular_id: regularId, repeat_days: [...new Set(days)].sort() });
      return { prayer: { ...row }, hostToken, regularId };
    },

    async update(id, token, changes) {
      await latency();
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("This jama'ah no longer exists.");
      if (!isHost(id, token)) throw new Error("Only the host can edit this jama'ah.");
      Object.assign(row, changes, { updated_at: new Date().toISOString() });
      return { ...row };
    },

    async stopRegular(regularId, token) {
      await latency();
      if (regularTokens.get(regularId) !== token) return false;
      regularTokens.delete(regularId);
      rows.filter((r) => r.regular_id === regularId).forEach((r) => (r.repeat_days = null));
      return true;
    },

    async join(id) {
      await latency();
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      row.attendee_count += 1;
      return { count: row.attendee_count, token: issueToken(id, 'attendee') };
    },

    async leave(id, token) {
      await latency();
      const issued = tokens.get(token);
      const row = rows.find((r) => r.id === id);
      if (!row || issued?.id !== id || issued.role !== 'attendee') return null;
      tokens.delete(token);
      row.attendee_count = Math.max(1, row.attendee_count - 1);
      return row.attendee_count;
    },

    async cancel(id, token) {
      await latency();
      const index = rows.findIndex((r) => r.id === id);
      if (index === -1 || !isHost(id, token)) return false;
      rows.splice(index, 1);
      return true;
    },

    async report() {
      await latency();
      // One demo device can never reach the threshold of 3.
      return false;
    },

    subscribe() {
      return () => {};
    },
  };
}

export const isDemoMode = supabase === null;
export const beaconApi: BeaconApi = supabase ? createSupabaseApi(supabase) : createDemoApi();
