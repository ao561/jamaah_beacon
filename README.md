# Jama'ah Beacon

Find or host a congregational prayer within walking distance, right now.

**Use it at [jammah-beacon.vercel.app](https://jammah-beacon.vercel.app)**. It works in any phone or laptop browser, and you can add it to your home screen like an app.

Drop a time-limited beacon where you're about to pray, and Muslims nearby can see it on the map, get directions and count themselves in. No account needed.

## Features

- **Host or join in seconds.** Pick the prayer and time, and your beacon appears on everyone's map. Others tap it to see the countdown, directions and how many are coming, then add themselves with +1.
- **Live.** New beacons, +1s, changes and cancellations show up on every phone within about a second.
- **Prayer times built in.** The host form suggests the right prayer for the time and warns if it falls outside that prayer's window. It supports 12 calculation methods (Moonsighting Committee by default) and Hanafi or Shafi'i Asr, saved per area. On Fridays it offers Jumu'ah.
- **Regular jama'ahs.** Running a weekly prayer at your office or campus? Set it to repeat, and a beacon appears automatically on the chosen days.
- **Qibla direction.** Every beacon shows the qibla from that spot, with a line on the map. On phones it becomes a live compass that tells you when you're facing the qibla.
- **Map or list.** Browse nearby beacons on the map, or as a list sorted by soonest or nearest.
- **Share links.** Send a beacon to friends on WhatsApp or anywhere else. The link opens straight to it.
- **Hosts stay in control.** Edit details, push the time back if you're running late, add a photo of the entrance, or cancel.
- **Community moderation.** Anyone can report a fake or inappropriate beacon. After a few reports it disappears for everyone.
- **Optional accounts.** Sign in with Google to manage your beacons from any device and show a "Verified" badge.
- **Light and dark mode.**

## Privacy

Which prayers someone attends can reveal their religion, so the app collects as little as possible:

- **No account needed.** Without one, your phone just remembers which beacons you hosted or joined.
- **Beacons are short-lived.** They leave the map shortly after the prayer starts and are deleted from the database about a day later.
- **Your location stays on your device.** It's used to centre the map and show distances, and isn't sent to the app's servers. The only location shared is the beacon pin a host chooses to drop.
- **Accounts are optional.** If you sign in, only your display name is ever public. You can delete your account and everything linked to it at any time.
- **Usage stats are anonymous.** They're daily totals only, with no IP addresses, device IDs or cookies.

Full details are in the [privacy policy](https://jammah-beacon.vercel.app/privacy).

## Built with

React 18, TypeScript, Vite, Tailwind CSS and Leaflet (OpenStreetMap) on the front end. The back end is Supabase (Postgres, Realtime and Auth), with prayer times from [adhan](https://github.com/batoulapps/adhan-js). It's hosted on Vercel.

How it all fits together is explained in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Running it yourself

```bash
npm install
npm run dev
```

Without Supabase credentials the app runs in **demo mode**, with three sample beacons in central London held in memory.

To connect a real back end:

1. Create a [Supabase](https://supabase.com) project.
2. Apply the database schema in [`supabase/migrations/`](supabase/migrations/), in filename order.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key (**Project settings → API**).
4. Restart `npm run dev`.

**Sign-in (optional):**

1. In Supabase, go to **Authentication → URL Configuration**. Set the Site URL to your deployed URL, and add `<your-url>/**` and `http://localhost:5173/**` as redirect URLs.
2. For Google, create an OAuth client ("Web application") in Google Cloud Console. Use `https://<project-ref>.supabase.co/auth/v1/callback` as its redirect URI, and paste the client ID and secret into **Authentication → Providers → Google**.
3. Email sign-in is hidden by default, because Supabase's built-in sender only delivers to your own team. Once a custom SMTP sender is connected (**Authentication → Emails → SMTP Settings**), set `VITE_EMAIL_SIGNIN=true`.

**Testing on a phone:** browsers only allow location access over `https://` or on `localhost`. Use a tunnel (e.g. `cloudflared tunnel --url http://localhost:5173`) or deploy the build (`npm run build` creates `dist/`) to any static host.

## License

[MIT](LICENSE) © Amaan Omar
