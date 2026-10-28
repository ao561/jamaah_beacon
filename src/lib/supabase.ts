import { createClient } from '@supabase/supabase-js';

// The dashboard often shows the REST endpoint (…/rest/v1/); supabase-js wants the bare project URL.
const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null when env vars are missing; the app then runs against in-memory demo data. */
export const supabase =
  url && key
    ? createClient(url, key, {
        // Accounts are optional; a session only exists once someone signs in. Implicit flow so a
        // magic link works even when opened in a different browser from the one that asked for it.
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      })
    : null;
