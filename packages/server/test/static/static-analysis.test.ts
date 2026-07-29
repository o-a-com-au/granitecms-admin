import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const srcDir = join(import.meta.dirname, '..', '..', 'src');

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(full);
    }
  }
  return files;
}

// A4: every site interaction must go through a base URL and token read
// from this app's own persisted configuration, never a hardcoded
// value. There is no site-calling code yet (Group C builds the
// registry/proxy routes) - this guard exists now so it starts doing
// real work the moment that code is added, rather than being bolted
// on after the fact.
const HARDCODED_URL_PATTERN = /https?:\/\/[^'"`\s]+/;

// Each entry names why a literal URL there is legitimate, not a
// hardcoded site.
const HARDCODED_URL_ALLOWLIST = new Set<string>([]);

function containsHardcodedUrl(contents: string): boolean {
  return HARDCODED_URL_PATTERN.test(contents);
}

test('A4 mechanism check (positive control): the hardcoded-URL pattern actually distinguishes a violating file from a compliant one', () => {
  const violating = `
    export async function fetchSite() {
      return fetch('https://client-one.example.com/v1/capabilities');
    }
  `;
  const compliant = `
    export async function fetchSite(baseUrl: string) {
      return fetch(new URL('/v1/capabilities', baseUrl));
    }
  `;

  assert.equal(containsHardcodedUrl(violating), true, 'must flag the violating fixture');
  assert.equal(containsHardcodedUrl(compliant), false, 'must not flag the compliant fixture');
});

test('A4: no hardcoded http(s) URL literal exists in packages/server/src outside a reasoned allowlist', () => {
  const offenders: string[] = [];
  for (const file of listTsFiles(srcDir)) {
    const relPath = relative(srcDir, file);
    const contents = readFileSync(file, 'utf-8');
    if (containsHardcodedUrl(contents) && !HARDCODED_URL_ALLOWLIST.has(relPath)) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unreviewed hardcoded URL usage in: ${offenders.join(', ')}`);
});

// B: every route must either require authentication or sit on a
// reasoned exemption allowlist. Not the file-level "does requireAuth
// appear anywhere in this file" shape (routes/auth.ts genuinely mixes
// an exempt route with a guarded one, which would make that shape
// pass trivially without ever catching a route that forgot the
// guard). Each route's own "window" is bounded by the next route
// registration in the same file (or EOF) - not a fixed character
// count - so it can never bleed into a neighbouring route's own
// guard declaration in either direction, confirmed by the mechanism
// check below against exactly that shape (an exempt route
// immediately followed by a guarded one, matching routes/auth.ts's
// real structure).
const ROUTE_REGISTRATION_PATTERN = /\.(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]/g;
const AUTH_GUARD_MARKER = /requireAuth\b/;

const ROUTE_AUTH_EXEMPTIONS = new Set<string>([
  'routes/health.ts::GET /health', // pre-existing Group A liveness probe, needed before any account exists
  'routes/auth.ts::POST /login', // must be reachable while unauthenticated - this is how a session is established
  'routes/auth.ts::POST /logout', // must succeed even against an already-expired/invalid session - requireAuth would 401 exactly the state logout exists to clean up
]);

interface RouteWindow {
  key: string;
  hasGuard: boolean;
}

function findRouteWindows(contents: string): RouteWindow[] {
  const matches = [...contents.matchAll(ROUTE_REGISTRATION_PATTERN)];
  return matches.map((match, index) => {
    // Both capture groups are mandatory in ROUTE_REGISTRATION_PATTERN
    // (not optional groups) - if `match` exists, so do match[1]/[2].
    // The next-match index is bounds-checked immediately above it.
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index! : contents.length;
    const window = contents.slice(start, end);
    const method = match[1]!.toUpperCase();
    const path = match[2]!;
    return { key: `${method} ${path}`, hasGuard: AUTH_GUARD_MARKER.test(window) };
  });
}

test('B mechanism check (positive control): the route-window scan actually distinguishes a violating route from a compliant one, without bleeding into a neighbour', () => {
  const fixture = `
    app.post('/login', async (request, reply) => {
      // no guard - this route is exempt, must not be flagged
    });

    app.post('/logout', async (request) => {
      // no guard - this route is also exempt, and is immediately
      // followed by a guarded route, the same shape as the real file
    });

    app.get('/me', { preHandler: requireAuth }, async (request) => request.currentUser);

    app.get('/unsafe', async () => ({ ok: true }));
  `;

  const windows = findRouteWindows(fixture);
  const byKey = new Map(windows.map((w) => [w.key, w.hasGuard]));

  assert.equal(byKey.get('POST /login'), false, 'login has no guard in its own window');
  assert.equal(byKey.get('POST /logout'), false, 'logout has no guard in its own window - must not see /me\'s guard bleed backwards');
  assert.equal(byKey.get('GET /me'), true, 'me must see its own requireAuth guard');
  assert.equal(byKey.get('GET /unsafe'), false, 'a genuinely unguarded route must be flagged');
});

test('B: every route registered under packages/server/src/routes/ either requires auth or sits on a reasoned exemption allowlist', () => {
  const routesDir = join(srcDir, 'routes');
  const offenders: string[] = [];

  for (const file of listTsFiles(routesDir)) {
    const relPath = relative(srcDir, file);
    const contents = readFileSync(file, 'utf-8');

    for (const { key, hasGuard } of findRouteWindows(contents)) {
      if (hasGuard) {
        continue;
      }
      const allowlistKey = `${relPath}::${key}`;
      if (!ROUTE_AUTH_EXEMPTIONS.has(allowlistKey)) {
        offenders.push(allowlistKey);
      }
    }
  }

  assert.deepEqual(offenders, [], `route(s) with no auth guard and no reasoned exemption: ${offenders.join(', ')}`);
});
