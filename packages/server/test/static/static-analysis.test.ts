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
const HARDCODED_URL_ALLOWLIST = new Set<string>([
  'config.ts', // ADMIN_BASE_URL's own local-dev fallback (http://localhost:${port}) - a real deployment behind a domain must set the env var explicitly
  'auth/oauth-google.ts', // Google's own fixed, well-known OAuth endpoints - not a registered site's URL, which is what this guard exists to catch
  'auth/oauth-github.ts', // GitHub's own fixed, well-known OAuth/API endpoints - same reasoning as oauth-google.ts
]);

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
  'routes/auth.ts::GET /me', // real auth (requireSession), deliberately not requireAuth - must stay reachable for a paused account too, so the frontend can show a paused notice instead of a raw 401
  'routes/auth.ts::POST /pause', // real auth (requireSession), same reason as /me - pausing yourself obviously can't require not already being paused
  'routes/auth.ts::POST /resume', // real auth (requireSession), same reason - must stay reachable *while paused*, or a paused account could never get back in
  'routes/oauth.ts::GET /providers', // reports only which provider ids are configured (no secrets, no per-user data) - the login page calls this before anyone is authenticated, to decide which buttons to show
  // The OAuth login-redirect and callback routes (routes/oauth.ts,
  // GET /:provider and GET /:provider/callback) are registered with
  // template-literal paths (`/${provider.id}`), not string literals,
  // so ROUTE_REGISTRATION_PATTERN's quote-only match never sees them
  // at all - no entry needed here, but noted: both are deliberately
  // unauthenticated by design (a visitor has no session yet when
  // starting the OAuth flow), matching POST /login's own exemption
  // above for the same underlying reason.
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

// A sibling check to B, same mechanism, different guard: every
// site-scoped route (one that takes a site/user-of-a-site id in its
// path) must also require site access, not just plain auth - otherwise
// any logged-in user, developer or client, could reach any site's data
// regardless of ownership/grant. GET / and POST / on routes/sites.ts
// are the only two genuine exemptions: GET / lists whichever sites the
// caller can see (its own scoping logic, not a per-resource guard),
// and POST / registers a brand new site that doesn't exist yet, so
// there's nothing to check access against.
const SITE_ACCESS_GUARD_MARKER = /requireSiteAccess\b/;
const SITE_ACCESS_EXEMPTIONS = new Set<string>([
  'routes/sites.ts::GET /', // lists whichever sites the caller can see - its own scoping logic, not a per-resource guard
  'routes/sites.ts::POST /', // registers a brand new site - nothing to check access against yet, gated by requireDeveloper instead
]);
const SITE_ACCESS_FILES = ['routes/sites.ts', 'routes/site-users.ts'];

function findSiteAccessWindows(contents: string): RouteWindow[] {
  const matches = [...contents.matchAll(ROUTE_REGISTRATION_PATTERN)];
  return matches.map((match, index) => {
    const start = match.index! + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index! : contents.length;
    const window = contents.slice(start, end);
    const method = match[1]!.toUpperCase();
    const path = match[2]!;
    return { key: `${method} ${path}`, hasGuard: SITE_ACCESS_GUARD_MARKER.test(window) };
  });
}

test('requireSiteAccess mechanism check (positive control): the same route-window scan distinguishes a violating site-scoped route from a compliant one', () => {
  const fixture = `
    app.get('/', { preHandler: requireAuth }, async () => ({ ok: true }));

    app.get('/:id/content', { preHandler: [requireAuth, requireSiteAccess] }, async (request) => {
      // guarded
    });

    app.delete('/:id', { preHandler: [requireAuth, requireSiteAccess] }, async (request) => {
      // guarded, immediately preceded by another guarded route - must not bleed backwards
    });

    app.post('/:id/oops', { preHandler: requireAuth }, async (request) => {
      // the site-scoping guard was forgotten here - must be flagged
    });
  `;

  const windows = findSiteAccessWindows(fixture);
  const byKey = new Map(windows.map((w) => [w.key, w.hasGuard]));

  assert.equal(byKey.get('GET /'), false, 'the list route has no site-access guard in its own window (exempted separately)');
  assert.equal(byKey.get('GET /:id/content'), true, 'a genuinely guarded route must see its own requireSiteAccess');
  assert.equal(byKey.get('DELETE /:id'), true, 'must not see a neighbour\'s guard bleed backwards');
  assert.equal(byKey.get('POST /:id/oops'), false, 'a route missing requireSiteAccess must be flagged');
});

test('requireSiteAccess: every site-scoped route in routes/sites.ts and routes/site-users.ts requires site access, or sits on a reasoned exemption allowlist', () => {
  const offenders: string[] = [];

  for (const relPath of SITE_ACCESS_FILES) {
    const contents = readFileSync(join(srcDir, relPath), 'utf-8');

    for (const { key, hasGuard } of findSiteAccessWindows(contents)) {
      if (hasGuard) {
        continue;
      }
      const allowlistKey = `${relPath}::${key}`;
      if (!SITE_ACCESS_EXEMPTIONS.has(allowlistKey)) {
        offenders.push(allowlistKey);
      }
    }
  }

  assert.deepEqual(offenders, [], `route(s) with no site-access guard and no reasoned exemption: ${offenders.join(', ')}`);
});
