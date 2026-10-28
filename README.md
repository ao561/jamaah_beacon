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
2. In the SQL editor, run [`0001_create_prayers.sql`](supabase/migrations/0001_create_prayers.sql) then [`0002_tokens_and_realtime.sql`](supabase/migrations/0002_tokens_and_realtime.sql), then [`0003_jumuah_rate_limits_reports.sql`](supabase/migrations/0003_jumuah_rate_limits_reports.sql), then [`0004_scheduled_cleanup.sql`](supabase/migrations/0004_scheduled_cleanup.sql), then [`0005_edit_and_regular_prayers.sql`](supabase/migrations/0005_edit_and_regular_prayers.sql). For demo data, also run [`supabase/seed.sql`](supabase/seed.sql). Seed times are relative to `now()`, so re-run it whenever the rows age out.
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
| Prayer-time suggestions and warnings | [`src/lib/prayerTimes.ts`](src/lib/prayerTimes.ts) |
| Device id and locally hidden (reported) beacons | [`src/lib/reports.ts`](src/lib/reports.ts) |
| Status rules and countdown formatting | [`src/lib/time.ts`](src/lib/time.ts) |
| Tunable windows, colours, fallback centre | [`src/lib/config.ts`](src/lib/config.ts) |
| Screen state machine (browse / create / adjust-pin / set-location) | [`src/App.tsx`](src/App.tsx) |

**Ephemerality.** Clients fetch beacons with `iqamah_time` between 45 minutes ago and 2 hours ahead. A beacon shows as *Upcoming* (green countdown) before its start time and *Praying now* (amber) afterwards. Its marker hides 10 minutes after the start, or 40 minutes for Jumu'ah, to cover the khutbah.

**Cleanup.** A `pg_cron` job (`prune-expired-beacons`, migrations 0004 and 0005) runs hourly. It deletes beacons more than a day past their start time, beacons hidden by reports more than a day ago, stopped or expired regular templates once they have no recent beacons, and old skip and rate-limit records. A host cancelling deletes the row immediately. Deleting a beacon cascades to its tokens and reports.

**Live updates.** Clients subscribe to Supabase Realtime changes on `prayers`, so new beacons, +1s and cancellations show up on every phone within about a second. Each time the connection opens or reconnects, the app refetches to catch anything it missed. It also polls every 60 seconds as a backup.

**Ownership without accounts.** `create_prayer` and `join_prayer` each return a random token, which the device keeps in `localStorage` (`joined_prayers`). Cancelling a beacon (`cancel_prayer`) needs the host token. Undoing a +1 (`leave_prayer`) needs that attendee's token, and each token works once. Strangers can't cancel someone else's beacon or remove their RSVPs. Clearing browser storage loses the ability to cancel or undo.

**Prayer times and Jumu'ah.** The host form calculates today's times on the device for the pin's location, using [`adhan`](https://github.com/batoulapps/adhan-js). Tapping the method name under the prayer picker lets users choose the calculation method (12 options, Moonsighting Committee by default), Asr convention, and summer (high-latitude) adjustment. It also shows today's full timetable for the pin, so users can compare it with their mosque's. Choices are saved per area: they apply to any pin within 50 km of where they were set, so a user can keep one convention at home and another when travelling. They're stored in `localStorage` (`prayer_settings_by_area`, see [`src/lib/prayerSettings.ts`](src/lib/prayerSettings.ts)). It preselects the prayer for the chosen time, shows that prayer's window, and shows an amber warning if the time falls outside it. Methods and madhabs differ, so these are never hard errors, and with the Asr setting on "Either" (the default), the lenient bound is used: Shafi'i Asr for Asr's start, Hanafi Asr for Dhuhr's end. On Fridays, Jumu'ah becomes an option and is suggested at midday. Its time is labelled "Khutbah", and it stays on the map for 40 minutes after the start instead of 10.

**Reports.** Anyone except the host can report a beacon: not a real jama'ah, wrong location, or inappropriate. The reporter stops seeing it immediately. Once 3 different devices report it, `hidden_at` is set and it disappears for everyone via realtime. Devices are identified by a random `device_id` in `localStorage`.

**Database guardrails** (the migrations):
- The anon role can only `select` from `prayers`. Every write goes through `security definer` functions: `create_prayer`, `create_regular_prayer`, `update_prayer`, `join_prayer`, `leave_prayer`, `cancel_prayer`, `stop_regular_prayer` and `report_prayer`.
- Tokens are stored only as SHA-256 hashes, in `prayer_tokens`. RLS is on and there are no policies, so nobody can read it through the API.
- A new beacon's iqamah must fall within the next ~2 hours. Joins are refused 15 minutes after iqamah. The count never drops below 1, since the host counts.
- Reads only return beacons from the last hour onwards, so old location history can't be scraped.
- Per-IP rate limits inside Postgres (`private.hit_rate_limit`). These cover creating (10 per 10 min and 30 per day), joining (120 per 10 min) and reporting (20 per hour). The IP comes from the `cf-connecting-ip` / `x-forwarded-for` headers that Supabase's edge sets. The limits are deliberately generous, because a whole office or campus Wi-Fi network often shares one IP. Tune them in migration 0003.
- Text length and lat/lng range checks.

**Host flow.** The pin defaults to your GPS fix. If accuracy is worse than ±50 m, or location is unavailable, the form prompts you to drag the pin. Submitting closes the form and shows a translucent pending pin while the write is in flight. If the write fails, the form reopens with your input intact. Once the beacon is live, its drawer opens with **Invite people** (the share sheet) and **Cancel this jama'ah**, which takes two taps.

**Editing.** The host's panel has **Running late? +5 / +10 min** and **Edit details**. Edit details reopens the form pre-filled, with a "Keep 13:15" time option, so changing the directions doesn't move the time. Edits go through `update_prayer`, which needs the host token, and reach everyone via realtime. Attendees, and anyone viewing the beacon, get a toast when its time or place changes. The panel then shows "Updated by the host at …".

**Regular jama'ahs.** "Repeat every week" in the host form saves a weekly template in `regular_prayers` (days, local time, time zone). Every 5 minutes, a `pg_cron` job (`materialize-regular-prayers`) creates an ordinary beacon for any template starting within the next 2 hours, at most one per template per local day. So joining, sharing, reporting and realtime work unchanged. The host's single token works for every day's beacon. **Cancel today only** records a skip so that day isn't recreated, and **Stop repeating** deactivates the template. A template expires 30 days after its last +1, and gets deactivated if one of its beacons is hidden by reports.

**Dark mode.** The header button cycles through System (the default, which follows the device), Light and Dark. The choice is saved in `localStorage` (`theme`). An inline script in `index.html` applies it before first paint, so there's no white flash. Components use Tailwind `dark:` variants keyed off a `.dark` class on `<html>`. OpenStreetMap has no dark tiles, so in dark mode the tile layer is recoloured with a CSS filter, and markers keep their real colours.

**Share links.** While a beacon is open, the address bar shows `…/?b=<id>`. Opening that link selects the beacon. If it has ended or been cancelled, the app says so.

**Location denied.** The map centres on London, and a banner offers "Set location": tap the map once to place yourself. Distances and the default host pin then use that spot.

## Departures from the original spec

- The spec's flow diagram says a +60 min lookahead, but its query uses +120 min. This uses **120 minutes** everywhere (`LOOKAHEAD_MINUTES`) so manually scheduled prayers stay visible.
- The spec's `increment_attendee` is replaced by `join_prayer`. It returns the new count, so the client can reconcile its optimistic +1, plus a token for undoing it. Direct inserts are replaced by `create_prayer`.
- The select policy is limited to recent rows instead of `using (true)`.
- No pin clustering. That only becomes useful at densities an MVP won't see. Add `react-leaflet-cluster` if it does.

## Known limitations

- **Spam.** Per-IP rate limits and reports catch casual abuse, but someone rotating IPs can still create fake beacons, and clearing `localStorage` allows another +1 or another report. The next layer is Cloudflare Turnstile, which needs a Cloudflare account for the site and secret keys.
- **Global fetch.** Every active beacon worldwide is fetched. Add a bounding-box filter on latitude/longitude, plus a composite index, once there is traffic in more than one city.
- **Map tiles.** Tiles come from OpenStreetMap's public servers, which are fine for development but have a [usage policy](https://operations.osmfoundation.org/policies/tiles/). Use a keyed provider (MapTiler, Stadia, Mapbox) in production.
- **Link previews.** Every shared link shows the same generic WhatsApp/iMessage preview. A per-beacon preview (prayer, place, time) would need an edge function that renders the meta tags.
- **Offline.** It's installable (manifest + icon), but there's no service worker. The app needs live data anyway.
