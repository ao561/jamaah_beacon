import { createClient } from '@supabase/supabase-js';

// The dashboard often shows the REST endpoint (…/rest/v1/); supabase-js wants the bare project URL.
const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null when env vars are missing; the app then runs against in-memory demo data. */
export const supabase =
  url && key
    ? createClient(url, key, {
        // Zero-auth app: never create or persist a session.
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;
