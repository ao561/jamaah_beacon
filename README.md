# Jama'ah Beacon

Find or host a congregational prayer within walking distance, right now. Drop a time-limited beacon at your exact spot, or tap a nearby one to see the countdown, directions and amenities, and count yourself in.

No accounts and no logins. The only thing the device remembers is which beacons it has already joined (`localStorage`).

## Quick start

```bash
npm install
npm run dev
```

With no Supabase credentials the app runs in **demo mode**: three mock beacons around central London, held in memory (they reset on reload). A "Demo data" badge appears in the header.

### Connect Supabase

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/migrations/0001_create_prayers.sql`](supabase/migrations/0001_create_prayers.sql). For demo data, also run [`supabase/seed.sql`](supabase/seed.sql). Seed times are relative to `now()`, so re-run it whenever the rows age out.
3. `cp .env.example .env.local` and fill in the project URL and anon/publishable key (Project settings → API).
4. Restart `npm run dev`.

Dependencies, if you're installing into another project:

```bash
npm install @supabase/supabase-js leaflet react-leaflet@4 lucide-react date-fns react@18 react-dom@18
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite typescript @types/leaflet @types/react@18 @types/react-dom@18
```

`react-leaflet@4` is the last major that supports React 18.

### Testing on a phone

Browsers only expose geolocation on `https://` or `localhost`. `npm run dev -- --host` over plain HTTP on your LAN gives you the "location is off" fallback. Use a tunnel (e.g. `cloudflared tunnel --url http://localhost:5173`) or deploy the static build (`npm run build` → `dist/`) to any static host.

## How it works

| Concern | Where |
| --- | --- |
| Data access (Supabase + in-memory demo fallback) | [`src/lib/beacons.ts`](src/lib/beacons.ts) |
| Fetch, poll every 30s, optimistic create and join | [`src/hooks/useBeacons.ts`](src/hooks/useBeacons.ts) |
| Status rules and countdown formatting | [`src/lib/time.ts`](src/lib/time.ts) |
| Tunable windows, colours, fallback centre | [`src/lib/config.ts`](src/lib/config.ts) |
| Screen state machine (browse / create / adjust-pin / set-location) | [`src/App.tsx`](src/App.tsx) |

**Ephemerality.** There is no cron job. Clients fetch beacons with `iqamah_time` between 15 minutes ago and 2 hours ahead. Markers hide locally 10 minutes after iqamah. A beacon is shown as *Upcoming* (green countdown) before iqamah and *Praying now* (amber) for the 10 minutes after.

**Database guardrails** (the migration):
- The anon role can only `select` and `insert`. The only later write is `increment_attendee()`, a `security definer` RPC that adds 1 atomically, refuses beacons that ended more than 15 minutes ago, and returns the new count.
- Inserts must start with `attendee_count = 1`, and the iqamah must fall within the next ~2 hours.
- Reads only return beacons from the last hour onwards, so old location history can't be scraped.
- Text length and lat/lng range checks.

**Host flow.** The pin defaults to your GPS fix. If accuracy is worse than ±50 m, or location is unavailable, the form prompts you to drag the pin. Submitting closes the form and shows a translucent pending pin while the write is in flight. If the write fails, the form reopens with your input intact. The host counts as the first attendee, so their own "+1" button is already disabled.

**Location denied.** The map centres on London, and a banner offers "Set location": tap the map once to place yourself. Distances and the default host pin then use that spot.

## Departures from the original spec

- The spec's flow diagram says a +60 min lookahead, but its query uses +120 min. This uses **120 minutes** everywhere (`LOOKAHEAD_MINUTES`) so manually scheduled prayers stay visible.
- `increment_attendee` returns the new count instead of `void`, so the client can reconcile its optimistic +1.
- The select policy is limited to recent rows instead of `using (true)`.
- No pin clustering. That only becomes useful at densities an MVP won't see. Add `react-leaflet-cluster` if it does.

## Known limitations

- **Spam.** Zero-auth means anyone can create beacons or bump counts (clearing `localStorage` allows another +1). Before a public launch, put inserts and RPCs behind an Edge Function with per-IP rate limiting, or add Cloudflare Turnstile.
- **Global fetch.** Every active beacon worldwide is fetched. Add a bounding-box filter on latitude/longitude, plus a composite index, once there is traffic in more than one city.
- **Map tiles.** Tiles come from OpenStreetMap's public servers, which are fine for development but have a [usage policy](https://operations.osmfoundation.org/policies/tiles/). Use a keyed provider (MapTiler, Stadia, Mapbox) in production.
- **Offline.** It's installable (manifest + icon), but there's no service worker. The app needs live data anyway.
- Rows are never deleted. The migration includes an optional `pg_cron` snippet for pruning.
