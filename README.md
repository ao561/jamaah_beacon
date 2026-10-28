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
2. In the SQL editor, run [`0001_create_prayers.sql`](supabase/migrations/0001_create_prayers.sql) and then [`0002_tokens_and_realtime.sql`](supabase/migrations/0002_tokens_and_realtime.sql). For demo data, also run [`supabase/seed.sql`](supabase/seed.sql). Seed times are relative to `now()`, so re-run it whenever the rows age out.
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
| Fetch, realtime subscription (plus a 60s fallback poll), optimistic create / join / leave, cancel | [`src/hooks/useBeacons.ts`](src/hooks/useBeacons.ts) |
| Host and attendee tokens in `localStorage` | [`src/lib/memberships.ts`](src/lib/memberships.ts) |
| Share links (`?b=<id>`), share sheet, clipboard fallback | [`src/lib/share.ts`](src/lib/share.ts) |
| Status rules and countdown formatting | [`src/lib/time.ts`](src/lib/time.ts) |
| Tunable windows, colours, fallback centre | [`src/lib/config.ts`](src/lib/config.ts) |
| Screen state machine (browse / create / adjust-pin / set-location) | [`src/App.tsx`](src/App.tsx) |

**Ephemerality.** There is no cron job. Clients fetch beacons with `iqamah_time` between 15 minutes ago and 2 hours ahead. Markers hide locally 10 minutes after iqamah. A beacon is shown as *Upcoming* (green countdown) before iqamah and *Praying now* (amber) for the 10 minutes after.

**Live updates.** Clients subscribe to Supabase Realtime changes on `prayers`, so new beacons, +1s and cancellations show up on every phone within about a second. Each time the connection opens or reconnects, the app refetches to catch anything it missed. It also polls every 60 seconds as a backup.

**Ownership without accounts.** `create_prayer` and `join_prayer` each return a random token, which the device keeps in `localStorage` (`joined_prayers`). Cancelling a beacon (`cancel_prayer`) needs the host token. Undoing a +1 (`leave_prayer`) needs that attendee's token, and each token works once. Strangers can't cancel someone else's beacon or remove their RSVPs. Clearing browser storage loses the ability to cancel or undo.

**Database guardrails** (the migrations):
- The anon role can only `select` from `prayers`. Every write goes through four `security definer` functions: `create_prayer`, `join_prayer`, `leave_prayer` and `cancel_prayer`.
- Tokens are stored only as SHA-256 hashes, in `prayer_tokens`. RLS is on and there are no policies, so nobody can read it through the API.
- A new beacon's iqamah must fall within the next ~2 hours. Joins are refused 15 minutes after iqamah. The count never drops below 1, since the host counts.
- Reads only return beacons from the last hour onwards, so old location history can't be scraped.
- Text length and lat/lng range checks.

**Host flow.** The pin defaults to your GPS fix. If accuracy is worse than ±50 m, or location is unavailable, the form prompts you to drag the pin. Submitting closes the form and shows a translucent pending pin while the write is in flight. If the write fails, the form reopens with your input intact. Once the beacon is live, its drawer opens with **Invite people** (the share sheet) and **Cancel this jama'ah**, which takes two taps.

**Share links.** While a beacon is open, the address bar shows `…/?b=<id>`. Opening that link selects the beacon. If it has ended or been cancelled, the app says so.

**Location denied.** The map centres on London, and a banner offers "Set location": tap the map once to place yourself. Distances and the default host pin then use that spot.

## Departures from the original spec

- The spec's flow diagram says a +60 min lookahead, but its query uses +120 min. This uses **120 minutes** everywhere (`LOOKAHEAD_MINUTES`) so manually scheduled prayers stay visible.
- The spec's `increment_attendee` is replaced by `join_prayer`. It returns the new count, so the client can reconcile its optimistic +1, plus a token for undoing it. Direct inserts are replaced by `create_prayer`.
- The select policy is limited to recent rows instead of `using (true)`.
- No pin clustering. That only becomes useful at densities an MVP won't see. Add `react-leaflet-cluster` if it does.

## Known limitations

- **Spam.** Zero-auth means anyone can create beacons or bump counts (clearing `localStorage` allows another +1). Before a public launch, put the RPCs behind an Edge Function with per-IP rate limiting, or add Cloudflare Turnstile.
- **Global fetch.** Every active beacon worldwide is fetched. Add a bounding-box filter on latitude/longitude, plus a composite index, once there is traffic in more than one city.
- **Map tiles.** Tiles come from OpenStreetMap's public servers, which are fine for development but have a [usage policy](https://operations.osmfoundation.org/policies/tiles/). Use a keyed provider (MapTiler, Stadia, Mapbox) in production.
- **Link previews.** Every shared link shows the same generic WhatsApp/iMessage preview. A per-beacon preview (prayer, place, time) would need an edge function that renders the meta tags.
- **Offline.** It's installable (manifest + icon), but there's no service worker. The app needs live data anyway.
- Rows are never deleted. The migration includes an optional `pg_cron` snippet for pruning.
