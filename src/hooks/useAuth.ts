import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { getProfile, getSession, onSessionChange, saveProfile, type Profile } from '../lib/account';

export interface AuthState {
  session: Session | null;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  /** False until the stored session (if any) has been read. */
  ready: boolean;
  updateProfile: (displayName: string | null, showName: boolean) => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    void getSession().then((s) => {
      setSession(s);
      setReady(true);
    });
    return onSessionChange(setSession);
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let live = true;
    void (async () => {
      try {
        // First sign-in: create the profile, which records the consent given on the sign-in form.
        const existing = (await getProfile(userId)) ?? (await saveProfile(null, true));
        if (live) setProfile(existing);
      } catch (err) {
        console.error('Failed to load profile', err);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  const updateProfile = useCallback(async (displayName: string | null, showName: boolean) => {
    setProfile(await saveProfile(displayName, showName));
  }, []);

  return { session, userId, email: session?.user.email ?? null, profile, ready, updateProfile };
}
