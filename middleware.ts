// Rich link previews for shared beacons (/?b=<id>). WhatsApp, iMessage and friends read a page's
// Open Graph tags without running its JavaScript, so this Vercel Routing Middleware fills them in
// from the beacon before index.html is served. People get the same page as always; anything
// unexpected (no such beacon, Supabase slow or down) falls through to the plain page.

// Vercel runs this file as-is in Node, without bundling it with the app, so it must not import
// from src/ (Node can't resolve those extensionless imports). Only npm packages and type imports.

import tzLookup from '@photostructure/tz-lookup';
import { next } from '@vercel/functions';
import type { Prayer, SalahName } from './src/lib/types';

export const config = { matcher: '/' };

declare const process: { env: Record<string, string | undefined> };

// Mirrors SALAH_LABELS and startLabel in src/lib/config.ts.
const SALAH_LABELS: Record<SalahName, string> = {
  Fajr: 'Fajr',
  Dhuhr: 'Dhuhr',
  Jumuah: "Jumu'ah",
  Asr: 'Asr',
  Maghrib: 'Maghrib',
  Isha: 'Isha',
};
const startLabel = (salah: SalahName) => (salah === 'Jumuah' ? 'Khutbah' : 'Iqamah');

// Mirrors HIDE_AFTER_MINUTES / JUMUAH_HIDE_AFTER_MINUTES: the app shows a beacon as ended after this.
const hideAfterMs = (salah: SalahName) => (salah === 'Jumuah' ? 40 : 10) * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 2500;
const COLUMNS = 'salah_name,location_name,iqamah_time,attendee_count,sisters_friendly,wudu_nearby,latitude,longitude';

type PreviewBeacon = Pick<
  Prayer,
  'salah_name' | 'location_name' | 'iqamah_time' | 'attendee_count' | 'sisters_friendly' | 'wudu_nearby' | 'latitude' | 'longitude'
>;

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('b');
  if (!id || !UUID.test(id)) return next();

  try {
    const [beacon, page] = await Promise.all([fetchBeacon(id), fetchPage(request, url.origin)]);
    if (!page) return next();
    const live = beacon && Date.now() < Date.parse(beacon.iqamah_time) + hideAfterMs(beacon.salah_name);
    const html = withPreview(page, live ? describe(beacon) : ENDED, url.toString());
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
    });
  } catch {
    return next();
  }
}

async function fetchBeacon(id: string): Promise<PreviewBeacon | null> {
  // Same normalisation as src/lib/supabase.ts.
  const base = process.env.VITE_SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!base || !key) return null;

  const query = `${base}/rest/v1/prayers?id=eq.${id}&hidden_at=is.null&select=${COLUMNS}`;
  const res = await fetch(query, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as PreviewBeacon[];
  return rows[0] ?? null;
}

/** The static app shell. The request has no `b`, so it skips this middleware. */
async function fetchPage(request: Request, origin: string): Promise<string | null> {
  // Pass on preview deployments' protection bypass, so they can be tested; production has none.
  const headers = new Headers();
  for (const name of ['cookie', 'x-vercel-protection-bypass']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const res = await fetch(`${origin}/`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  const html = await res.text();
  // Only ever rewrite the app's own page (not, say, a login wall in front of it).
  return html.includes('<div id="root"></div>') ? html : null;
}

interface Preview {
  title: string;
  description: string;
}

const ENDED: Preview = {
  title: "Jama'ah Beacon",
  description: "This jama'ah has ended or was cancelled. Open Jama'ah Beacon to find another one nearby.",
};

/** "Asr jama'ah at Library, 2nd floor" / "Iqamah 16:15 · 4 going · Wudu nearby. Tap to …" */
export function describe(beacon: PreviewBeacon, now = new Date()): Preview {
  // Beacons don't store a time zone, so show the time as it is where the beacon is.
  let timeZone = 'UTC';
  try {
    timeZone = tzLookup(beacon.latitude, beacon.longitude);
  } catch {
    // Out-of-range coordinates; the database rejects these anyway.
  }
  const start = new Date(beacon.iqamah_time);
  const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(start);
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone });
  const when =
    start <= now
      ? `Started at ${clock}`
      : `${startLabel(beacon.salah_name)} ${day(start) === day(now) ? '' : 'tomorrow '}${clock}`;

  const details = [
    when,
    `${beacon.attendee_count} going`,
    beacon.sisters_friendly && "Sisters' space",
    beacon.wudu_nearby && 'Wudu nearby',
  ].filter(Boolean);

  return {
    title: `${SALAH_LABELS[beacon.salah_name]} jama'ah at ${beacon.location_name}`,
    description: `${details.join(' · ')}. Tap to see where and count yourself in.`,
  };
}

export function withPreview(html: string, preview: Preview, pageUrl: string): string {
  const title = escapeHtml(preview.title);
  const description = escapeHtml(preview.description);
  // Replacer functions, so a "$" in user text isn't read as a replacement pattern.
  const content = (value: string) => (_: string, opening: string) => opening + value;
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, content(description))
    .replace(/(<meta property="og:title" content=")[^"]*/, content(title))
    .replace(/(<meta property="og:description" content=")[^"]*/, content(description))
    .replace('</head>', () => `  <meta property="og:url" content="${escapeHtml(pageUrl)}" />\n  </head>`);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
