import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Prayer } from './types';

// Optional accounts. Everything here needs Supabase; in demo mode accounts are unavailable.

export const accountsAvailable = supabase !== null;

/**
 * Supabase's built-in mailer only delivers to the project's own team, so email sign-in stays
 * hidden until a custom SMTP sender is configured and VITE_EMAIL_SIGNIN=true is set.
 */
export const emailSignInEnabled = import.meta.env.VITE_EMAIL_SIGNIN === 'true';

export interface Profile {
  id: string;
  display_name: string | null;
  show_name: boolean;
}

export interface RegularSummary {
  id: string;
  salah_name: Prayer['salah_name'];
  location_name: string;
  time_of_day: string;
  timezone: string;
  days: number[];
  active: boolean;
  expires_at: string;
}

export interface MyJamaahs {
  hosting: Prayer[];
  regulars: RegularSummary[];
  joined: Prayer[];
}

function client() {
  if (!supabase) throw new Error('Accounts need the app to be connected to Supabase.');
  return supabase;
}

const redirectTo = () => window.location.origin + window.location.pathname;

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onSessionChange(fn: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => fn(session));
  return () => data.subscription.unsubscribe();
}

/** Emails a sign-in link (and a 6-digit code, if the email template includes it). */
export async function sendSignInEmail(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await client().auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client().from('profiles').select('id, display_name, show_name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

/** Also records consent (the profile is created on first save) and updates the name on live beacons. */
export async function saveProfile(displayName: string | null, showName: boolean): Promise<Profile> {
  const { data, error } = await client().rpc('save_profile', { display_name: displayName, show_name: showName });
  if (error) throw error;
  return data as Profile;
}

export async function deleteAccount(): Promise<void> {
  const { error } = await client().rpc('delete_my_account');
  if (error) throw error;
  await client().auth.signOut({ scope: 'local' });
}

/** Beacon id -> role, for beacons still visible. */
export async function getMyMemberships(): Promise<Record<string, 'host' | 'attendee'>> {
  const { data, error } = await client().rpc('my_memberships');
  if (error) throw error;
  const rows = (data ?? []) as { prayer_id: string; role: 'host' | 'attendee' }[];
  // A host who also has an attendee row is still the host.
  return rows.reduce<Record<string, 'host' | 'attendee'>>((acc, r) => {
    if (acc[r.prayer_id] !== 'host') acc[r.prayer_id] = r.role;
    return acc;
  }, {});
}

export async function getMyJamaahs(): Promise<MyJamaahs> {
  const { data, error } = await client().rpc('my_jamaahs');
  if (error) throw error;
  return (data as MyJamaahs | null) ?? { hosting: [], regulars: [], joined: [] };
}

export async function restartRegular(regularId: string): Promise<void> {
  const { data, error } = await client().rpc('restart_regular_prayer', { regular_id: regularId });
  if (error) throw error;
  if (!data) throw new Error("Couldn't restart it.");
}
