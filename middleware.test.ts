import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import middleware, { previewFor, withPreview } from './middleware';
import type { Prayer } from './src/lib/types';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SHELL = readFileSync(join(ROOT, 'index.html'), 'utf8');
const NOW = Date.parse('2026-11-20T12:00:00Z');
const MINUTE = 60_000;
const ID = '521bbef7-9dc2-4673-b0f0-f7e486d70dc6';

type Row = Parameters<typeof previewFor>[0];
const beacon = (changes: Partial<Prayer> = {}): Row => ({
  salah_name: 'Asr',
  location_name: 'Library, 2nd floor',
  iqamah_time: new Date(NOW + 15 * MINUTE).toISOString(),
  attendee_count: 4,
  sisters_friendly: true,
  wudu_nearby: true,
  latitude: 51.5074,
  longitude: -0.1278,
  ...changes,
});

/** Fakes Supabase and the static app shell, the two things the middleware fetches. */
function stubFetch({ rows = [beacon()], supabaseStatus = 200, page = SHELL }: { rows?: Row[]; supabaseStatus?: number; page?: string } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://db.test/')) {
      return supabaseStatus === 200 ? Response.json(rows) : new Response('', { status: supabaseStatus });
    }
    if (url === 'https://beacon.test/') return new Response(page);
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const run = (query: string) => middleware(new Request(`https://beacon.test/${query}`));
const passedThrough = (res: Response) => res.headers.get('x-middleware-next') !== null;
const meta = async (res: Response) => {
  const html = await res.text();
  return {
    title: html.match(/<title>([^<]*)<\/title>/)?.[1],
    description: html.match(/<meta property="og:description" content="([^"]*)"/)?.[1],
    url: html.match(/<meta property="og:url" content="([^"]*)"/)?.[1],
  };
};

beforeEach(() => {
  // The dashboard's REST URL, as people often paste it: the middleware must strip /rest/v1/.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://db.test/rest/v1/');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('middleware', () => {
  it('leaves links without a beacon alone', async () => {
    const fetchMock = stubFetch();
    expect(passedThrough(await run(''))).toBe(true);
    expect(passedThrough(await run('?b=not-a-uuid'))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fills in a live beacon's preview", async () => {
    const fetchMock = stubFetch();
    const res = await run(`?b=${ID}`);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await meta(res)).toEqual({
      title: 'Asr jama&#39;ah at Library, 2nd floor',
      description: 'Iqamah 12:15 · 4 going · Sisters&#39; space · Wudu nearby. Tap to see where and count yourself in.',
      url: `https://beacon.test/?b=${ID}`,
    });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(new RegExp(`^https://db\\.test/rest/v1/prayers\\?id=eq\\.${ID}&hidden_at=is\\.null`));
  });

  it('serves the app itself, not just the tags', async () => {
    stubFetch();
    expect(await (await run(`?b=${ID}`)).text()).toContain('<div id="root"></div>');
  });

  it('says a beacon has ended once the app hides it', async () => {
    stubFetch({ rows: [beacon({ iqamah_time: new Date(NOW - 9 * MINUTE).toISOString() })] });
    expect((await meta(await run(`?b=${ID}`))).description).toMatch(/^Started at 11:51/);

    stubFetch({ rows: [beacon({ iqamah_time: new Date(NOW - 10 * MINUTE).toISOString() })] });
    expect((await meta(await run(`?b=${ID}`))).description).toMatch(/has ended or was cancelled/);
  });

  it("keeps Jumu'ah for 40 minutes", async () => {
    stubFetch({ rows: [beacon({ salah_name: 'Jumuah', iqamah_time: new Date(NOW - 39 * MINUTE).toISOString() })] });
    expect((await meta(await run(`?b=${ID}`))).description).toMatch(/^Started at/);

    stubFetch({ rows: [beacon({ salah_name: 'Jumuah', iqamah_time: new Date(NOW - 40 * MINUTE).toISOString() })] });
    expect((await meta(await run(`?b=${ID}`))).description).toMatch(/has ended/);
  });

  it('says a cancelled or unknown beacon has ended', async () => {
    stubFetch({ rows: [] });
    const { title, description } = await meta(await run(`?b=${ID}`));
    expect(title).toBe('Jama&#39;ah Beacon');
    expect(description).toMatch(/has ended or was cancelled/);
  });

  it("serves the plain page if Supabase can't be reached, rather than saying it ended", async () => {
    stubFetch({ supabaseStatus: 503 });
    expect(passedThrough(await run(`?b=${ID}`))).toBe(true);

    vi.stubEnv('VITE_SUPABASE_URL', '');
    stubFetch();
    expect(passedThrough(await run(`?b=${ID}`))).toBe(true);
  });

  it("never rewrites a page that isn't the app (e.g. a login wall)", async () => {
    stubFetch({ page: '<html><head><title>Log in</title></head><body>Vercel</body></html>' });
    expect(passedThrough(await run(`?b=${ID}`))).toBe(true);
  });

  // Vercel runs middleware.ts on its own in Node, without bundling it with the app, so it may
  // only import npm packages. An import Node can't resolve (like the extensionless "./src/..."
  // one that once slipped through) crashes every request to the home page.
  it('loads and runs in plain Node, the way Vercel runs it', () => {
    const { outputText } = ts.transpileModule(readFileSync(join(ROOT, 'middleware.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    // Inside node_modules, so the npm imports resolve as they do on Vercel.
    const dir = join(ROOT, 'node_modules', '.cache', 'middleware-test');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'middleware.mjs');
    writeFileSync(file, outputText);

    const script = `
      const { default: run } = await import(${JSON.stringify(pathToFileURL(file).href)});
      const res = await run(new Request('https://beacon.test/'));
      console.log(res.headers.get('x-middleware-next') !== null);
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(output.trim()).toBe('true');
  });
});

describe('previewFor', () => {
  it('calls the start time "Khutbah" for Jumu\'ah', () => {
    const { title, description } = previewFor(beacon({ salah_name: 'Jumuah', sisters_friendly: false, wudu_nearby: false }), new Date(NOW));
    expect(title).toBe("Jumu'ah jama'ah at Library, 2nd floor");
    expect(description).toBe('Khutbah 12:15 · 4 going. Tap to see where and count yourself in.');
  });

  it("shows the time where the beacon is, not where the server is", () => {
    const newYork = beacon({ latitude: 40.7128, longitude: -74.006, iqamah_time: '2026-11-21T00:30:00Z' });
    expect(previewFor(newYork, new Date('2026-11-20T23:50:00Z')).description).toMatch(/^Iqamah 19:30 ·/);
  });

  it('says "tomorrow" when it starts after local midnight', () => {
    const fajr = beacon({ salah_name: 'Fajr', iqamah_time: '2026-11-21T05:30:00Z' });
    expect(previewFor(fajr, new Date('2026-11-20T23:50:00Z')).description).toMatch(/^Iqamah tomorrow 05:30 ·/);
  });
});

describe('withPreview', () => {
  it('escapes user text, including "$" replacement patterns', () => {
    const html = withPreview(SHELL, { title: '<script>alert(1)</script> "$&" $1 & co', description: 'd' }, 'https://x/?b=1&a="2"');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('<title>&#60;script&#62;alert(1)&#60;/script&#62; &#34;$&#38;&#34; $1 &#38; co</title>');
    expect(html).toContain('<meta property="og:url" content="https://x/?b=1&#38;a=&#34;2&#34;" />');
  });
});
