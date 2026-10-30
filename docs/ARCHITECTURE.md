# Architecture

Jama'ah Beacon is a single-page React app with no server of its own. Vite builds it into static files that Vercel serves, and the browser talks to Supabase directly. All the rules about who can create, edit or cancel what live in Postgres.

## Code map

| Concern | Where |
| --- | --- |
| Data access (Supabase, plus the in-memory demo fallback) | [`src/lib/beacons.ts`](../src/lib/beacons.ts) |
| Fetching, realtime subscription, optimistic create / join / leave, cancel | [`src/hooks/useBeacons.ts`](../src/hooks/useBeacons.ts) |
| Host and attendee tokens in `localStorage` | [`src/lib/memberships.ts`](../src/lib/memberships.ts) |
| Sign-in and account helpers | [`src/lib/account.ts`](../src/lib/account.ts), [`src/hooks/useAuth.ts`](../src/hooks/useAuth.ts) |
| Share links (`?b=<id>`), share sheet, clipboard fallback | [`src/lib/share.ts`](../src/lib/share.ts) |
| Prayer-time suggestions and warnings | [`src/lib/prayerTimes.ts`](../src/lib/prayerTimes.ts), [`src/lib/prayerSettings.ts`](../src/lib/prayerSettings.ts) |
| Qibla bearing and live compass | [`src/lib/qibla.ts`](../src/lib/qibla.ts), [`src/hooks/useCompass.ts`](../src/hooks/useCompass.ts) |
| Device id and locally hidden (reported) beacons | [`src/lib/reports.ts`](../src/lib/reports.ts) |
| Status rules and countdown formatting | [`src/lib/time.ts`](../src/lib/time.ts) |
| Tunable windows, colours, fallback centre | [`src/lib/config.ts`](../src/lib/config.ts) |
| Screen state (browse / create / adjust pin / set location), map centring | [`src/App.tsx`](../src/App.tsx) |
| Database schema, functions and scheduled jobs | [`supabase/migrations/`](../supabase/migrations/) |

## Data and security

The anon role can only `select` from `prayers`. Every write goes through `security definer` functions: `create_prayer`, `create_regular_prayer`, `update_prayer`, `join_prayer`, `leave_prayer`, `cancel_prayer`, `stop_regular_prayer`, `report_prayer`, `set_prayer_photo` and the account functions. Other safeguards:

- **Recent rows only.** Reads only return beacons from the last hour onwards, so old location history can't be scraped.
- **Write rules.** A new beacon's start time must fall within the next ~2 hours, joins are refused 15 minutes after the start, and the count never drops below 1, since the host counts. Text lengths and lat/lng ranges are checked.
- **Hashed tokens.** Tokens are stored only as SHA-256 hashes, in `prayer_tokens`. RLS is on with no policies, so the API can't read it.
- **Private schema.** Tables in the `private` schema (rate limits, owners, skips, stats) aren't exposed through the API at all.
- **Per-IP rate limits** inside Postgres (`private.hit_rate_limit`). They cover creating, joining, reporting and event tracking. The IP comes from the headers that Supabase's edge sets. The limits are generous, because a whole office or campus network often shares one IP.

**Ownership without accounts.** `create_prayer` and `join_prayer` each return a random token, which the device keeps in `localStorage`. Cancelling or editing a beacon needs the host token. Undoing a +1 needs that attendee's token. Clearing browser storage loses those abilities, unless the user is signed in.

**Accounts.** Signing in with Google, or with an email link or 6-digit code, is optional and needs explicit consent, because prayer attendance is special-category data under UK GDPR. With an account:
- beacons and regular spots are owned by the account (`private.prayer_owners`, `regular_prayers.owner_id`), so they can be managed from any device
- joins are linked to the account, so the same person can't be counted twice across devices
- beacons show "Hosted by <name>" plus a **Verified** badge, meaning a confirmed email or Google account, not identity vetting

Only the display name is ever public. Emails stay in `auth.users`. `delete_my_account()` removes the user, their profile and all links; their +1s remain as anonymous counts.

## Lifecycle

**Visibility windows.** Clients fetch beacons whose start time is between 45 minutes ago and 2 hours ahead. A beacon shows as *Upcoming* before its start and *Praying now* afterwards. Its marker hides 10 minutes after the start, or 40 minutes for Jumu'ah, to cover the khutbah.

**Live updates.** Clients subscribe to Supabase Realtime changes on `prayers`. On every connect and reconnect the app refetches to catch anything it missed, and it polls every 60 seconds as a backup.

**Cleanup.** A `pg_cron` job (`prune-expired-beacons`) runs hourly. It deletes:
- beacons more than a day past their start
- beacons that were hidden by reports more than a day ago
- regular spots that were stopped or expired and have no recent beacons
- old skip and rate-limit records

Cancelling deletes the row immediately. Deleting a beacon cascades to its tokens, reports and photo.

**Regular jama'ahs.** "Repeat every week" saves a template in `regular_prayers` (days, local time, time zone). Every 5 minutes a second `pg_cron` job (`materialize-regular-prayers`) creates an ordinary beacon for any template starting within the next 2 hours, at most one per template per local day. That means joining, sharing, reporting and realtime all work unchanged. "Cancel today only" records a skip. A template expires 30 days after its last +1, and is deactivated if one of its beacons is hidden by reports.

**Reports.** The reporter stops seeing the beacon immediately. Once 3 different devices report it, `hidden_at` is set and it disappears for everyone.

## Features in detail

**Prayer times.** These are calculated on the device with [`adhan`](https://github.com/batoulapps/adhan-js), for the pin's location. Users choose the method, the Asr convention and the high-latitude rule. Settings are saved per area, and apply to any pin within 50 km of where they were set. Methods differ, so out-of-window times only get a warning, never an error. With Asr on "Either" (the default), the lenient bound is used.

**Photos.** The phone shrinks a photo to at most 1280 px and 350 KB and re-encodes it as JPEG, which strips EXIF metadata such as GPS position. Photos are stored in Postgres (`prayer_photos`) rather than Storage, so they're deleted by the same cascade as their beacon. The server checks the file type from the bytes and caps size at 400 KB.

**Qibla.** The great-circle bearing to the Kaaba is calculated from the beacon's pin. The map line stays about 150 px long at any zoom, because only the start of a great circle is straight on a flat map. The live compass reads the phone's heading: `webkitCompassHeading` on iOS (after the motion-permission prompt) and `deviceorientationabsolute` on Android. It's smoothed along the shortest arc.

**Usage stats.** Anonymous daily counters in `private.daily_stats`, filled by database triggers and by a `track_event` function that only accepts a fixed set of event names.

**Layout.** Panels are bottom sheets on phones and a left side panel from 640 px wide. When a beacon or the qibla line is focused, the map is centred in whatever area the header and open panel leave uncovered (measured via `data-sheet`).

**Dark mode.** An inline script in `index.html` applies a saved dark theme before first paint. OpenStreetMap has no dark tiles, so the tile layer is recoloured with a CSS filter.

## Scaling notes

- **Map tiles.** Tiles come from OpenStreetMap's public servers, which have a [usage policy](https://operations.osmfoundation.org/policies/tiles/). Switch to a keyed provider (MapTiler, Stadia, Mapbox) as traffic grows.
- **Global fetch.** Every active beacon worldwide is fetched. Add a bounding-box filter and a composite index once there's traffic in more than one city.
- **Photos.** At larger scale, move photos to Supabase Storage with a cleanup function.
- **Link previews.** Every shared link shows the same preview. A per-beacon preview would need an edge function that renders the meta tags.
- **Offline.** There's no service worker, since the app needs live data anyway.
