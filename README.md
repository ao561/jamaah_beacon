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
2. In the SQL editor, run [`0001_create_prayers.sql`](supabase/migrations/0001_create_prayers.sql) then [`0002_tokens_and_realtime.sql`](supabase/migrations/0002_tokens_and_realtime.sql), then [`0003_jumuah_rate_limits_reports.sql`](supabase/migrations/0003_jumuah_rate_limits_reports.sql), then [`0004_scheduled_cleanup.sql`](supabase/migrations/0004_scheduled_cleanup.sql), then [`0005_edit_and_regular_prayers.sql`](supabase/migrations/0005_edit_and_regular_prayers.sql), then [`0006_photos_and_stats.sql`](supabase/migrations/0006_photos_and_stats.sql), then [`0007_accounts.sql`](supabase/migrations/0007_accounts.sql), then [`0008_account_grants.sql`](supabase/migrations/0008_account_grants.sql). For demo data, also run [`supabase/seed.sql`](supabase/seed.sql). Seed times are relative to `now()`, so re-run it whenever the rows age out.
3. `cp .env.example .env.local` and fill in the project URL and anon/publishable key (Project settings → API).
4. Restart `npm run dev`.

### Accounts (optional sign-in)

Accounts are optional. Without this setup the app works as before, and only the sign-in screen fails. In the Supabase dashboard:

1. **Authentication → URL Configuration:** set the Site URL to your deployed URL, e.g. `https://jammah-beacon.vercel.app`. Add redirect URLs for it and for local dev: `https://jammah-beacon.vercel.app/**` and `http://localhost:5173/**`.
2. **Authentication → Emails → Magic Link** template: add the code, e.g. `<p>Or enter this code: <strong>{{ .Token }}</strong></p>`. Home-screen apps on iPhone don't share storage with Safari, so typing the code is the reliable way to sign in there.
3. **Google:** create an OAuth client (type "Web application") in Google Cloud Console → APIs & Services → Credentials. Its authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`. Paste the client ID and secret into **Authentication → Providers → Google**.
4. **Email sign-in is hidden by default**, because Supabase's built-in sender only delivers to your own project team. Once a custom sender is set up (step 5), set `VITE_EMAIL_SIGNIN=true` in your env (locally and in Vercel) and redeploy.
5. **Custom email sender:** Supabase's built-in sender only sends a few emails an hour. Connect a provider such as Resend under **Authentication → Emails → SMTP Settings**.

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

**List view.** The **List** button swaps the map for cards, sorted Soonest or Nearest. Each card shows the prayer, how long until it starts, place, distance, attendee count, and whether it repeats, has a photo, or you're hosting or going. Tapping a card opens that beacon on the map. The prayer filters apply to both views.

**Photos.** Hosts can attach one photo per beacon, and replace or remove it when editing. The phone shrinks it to at most 1280 px and 350 KB and re-encodes it as JPEG, which also strips EXIF metadata such as the GPS position. Photos are stored in Postgres (`prayer_photos`, set via `set_prayer_photo`, read via `get_prayer_photo`) rather than Supabase Storage. So a photo is deleted by the same cascade as its beacon, and there are no orphaned files to clean up. The server checks the file type from its bytes and caps size at 400 KB. A regular jama'ah's photo is copied onto each day's beacon. At larger scale, consider moving photos to Storage with a cleanup function.

**Usage stats.** Anonymous daily counters in `private.daily_stats`. There are no identifiers: no IPs, devices or cookies. Database triggers count beacons created, regular days generated, joins, undos, edits, photos, cancels, reports and hidden beacons. The app reports app opens, beacon views, list opens and shares through `track_event`, which only accepts those names and is rate limited. To read them, run `select * from private.daily_summary;` in the SQL editor.

**Welcome and install.** First-time visitors get a short skippable intro: what it is, how to join, how to host. On phones, and on browsers that can install apps, it adds an "Add to home screen" step. The location permission prompt waits until the intro is done. Visitors arriving on a shared `?b=` link skip the intro until their next visit. The header's **?** button reopens it. Installing uses Chrome's `beforeinstallprompt` where it's available. Otherwise it shows instructions for iPhone (Share → Add to Home Screen), Android (browser menu), or in-app browsers like WhatsApp (open in Safari/Chrome first). After someone first joins or hosts, a one-time card offers the same help. The PNG app icons in `public/` (192, 512, maskable 512, and a 180 Apple touch icon) are generated from `icon.svg`.

**Accounts.** Accounts are optional, signing in with an email link or 6-digit code, or with Google. Signing in requires explicit consent, because which prayers someone attends can reveal their religion, special-category data under UK GDPR. A short privacy notice sits on the sign-in screen. With an account:
- beacons and regular spots are owned by the account (`private.prayer_owners`, `regular_prayers.owner_id`), so they can be managed from any device
- joins are linked to the account, so it can't be double-counted across devices, and "You're counted in" shows everywhere
- beacons show "Hosted by <name>", where the name is optional, plus a **Verified** badge. "Verified" means a confirmed email or Google account, not identity vetting
- **My jama'ahs** lists what you're hosting now, your regular spots (stop and restart), and what you joined recently

Device tokens still work alongside accounts. Only the display name is ever public. Emails stay in `auth.users`, and the host and attendee links live in tables the API can't read. **Delete account** removes the user, their profile and all links. Their +1s remain as anonymous counts, and their regular spots stop. See `delete_my_account()` in migration 0007.

**Qibla.** Each beacon's panel shows the qibla direction from the beacon's pin: the great-circle bearing to the Kaaba (`src/lib/qibla.ts`, checked against published values for several cities), its compass point, and the distance to Makkah. **Show on map** draws a short dashed line with an arrowhead. Only the start of a great circle is straight on a flat map, so the line stays about 150 px long at any zoom. On phones, **Use compass** turns the dial into a live compass from the magnetometer (`src/hooks/useCompass.ts`). On iOS it uses `webkitCompassHeading`, after the motion-permission prompt; on Android, `deviceorientationabsolute`. It says "Turn left/right N°", goes green with a short vibration when you're within 5°, and shows a figure-8 calibration hint when the reported accuracy is poor. Laptops have no compass, so they get the bearing and the map line.

**Layout.** On phones, panels are bottom sheets. From 640 px wide they become a left-hand side panel, so the map stays visible beside them. When a beacon or the qibla line is focused, the map is centred in whatever area the header and the open panel leave uncovered (measured via `data-sheet`).

**Dark mode.** Light by default. The moon/sun button in the header switches between light and dark, and the choice is saved in `localStorage` (`theme`). An inline script in `index.html` applies a saved dark theme before first paint, so there's no white flash. Components use Tailwind `dark:` variants keyed off a `.dark` class on `<html>`. OpenStreetMap has no dark tiles, so in dark mode the tile layer is recoloured with a CSS filter, and markers keep their real colours.

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
