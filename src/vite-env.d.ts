/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** "true" once a custom SMTP sender is set up in Supabase; until then only Google sign-in is offered. */
  readonly VITE_EMAIL_SIGNIN?: string;
  /** MapTiler API key for map tiles; without it the map uses OpenStreetMap's public tile servers. */
  readonly VITE_MAPTILER_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
