import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import * as Sentry from '@sentry/node';
import { healthRoutes } from './routes/health.ts';
import { createAuthRoutes } from './routes/auth.ts';
import { createSitesRoutes } from './routes/sites.ts';
import { createSiteUsersRoutes } from './routes/site-users.ts';
import { createOAuthRoutes } from './routes/oauth.ts';
import { createSiteInvitesRoutes, createInviteClaimRoutes } from './routes/site-invites.ts';
import { loadConfig, type AdminConfig } from './config.ts';
import type { Store } from './store/store.ts';
import type { UserStore } from './store/user-store.ts';
import { openInMemoryUserStore } from './store/user-store.ts';
import type { SiteStore } from './store/site-store.ts';
import { openInMemorySiteStore } from './store/site-store.ts';
import type { SiteAccessStore } from './store/site-access-store.ts';
import { openInMemorySiteAccessStore } from './store/site-access-store.ts';
import type { SiteInviteStore } from './store/site-invite-store.ts';
import { openInMemorySiteInviteStore } from './store/site-invite-store.ts';
import { toSessionStore, type SessionRecord } from './auth/session-store-adapter.ts';
import { openInMemoryStore } from './store/in-memory-store.ts';
import type { OAuthProvider } from './auth/oauth-provider.ts';
import type { Mailer } from './email/mailer.ts';
import './auth/session-types.ts';

export interface ServerDeps {
  usersStore: UserStore;
  sessionRecordStore: Store<SessionRecord>;
  sessionSecret: string;
  sitesStore: SiteStore;
  siteAccessStore: SiteAccessStore;
  siteInviteStore: SiteInviteStore;
  oauthProviders: OAuthProvider[];
  baseUrl: string;
  mailer: Mailer | undefined;
}

// Ephemeral, tests/dev-only default (fresh in-memory stores, a random
// per-process secret) - mirrors the config parameter's default-via-
// loadConfig() pattern, but real production boot (index.ts) always
// constructs and passes real JSON-file-backed deps explicitly, never
// relying on this. No providers/mailer by default, so baseUrl being
// empty never matters - a test that actually exercises the OAuth or
// invite routes passes its own deps with a real one.
function defaultDeps(): ServerDeps {
  return {
    usersStore: openInMemoryUserStore(),
    sessionRecordStore: openInMemoryStore<SessionRecord>(),
    sessionSecret: randomBytes(48).toString('hex'),
    sitesStore: openInMemorySiteStore(),
    siteAccessStore: openInMemorySiteAccessStore(),
    siteInviteStore: openInMemorySiteInviteStore(),
    oauthProviders: [],
    baseUrl: '',
    mailer: undefined,
  };
}

function isFastifyError(error: unknown): error is FastifyError {
  return error instanceof Error && 'statusCode' in error;
}

// A handful of domain errors (SiteNotFoundError so far) carry their
// own machine-readable `reason` alongside the human message, the same
// convention plain route-handler 404 bodies already use (e.g.
// routes/sites.ts's `{ error: '...', reason: 'not-found' }' returns) -
// forwarded through so frontend error parsing (site-content.ts's
// SiteContentError, site-editor.ts's SiteEditorError) can react to
// this exact class of error the same way it reacts to those.
function reasonOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'reason' in error && typeof error.reason === 'string'
    ? error.reason
    : undefined;
}

// Mirrors the agent repo's own server.ts error handler: pass a
// non-500 domain error (AuthError and friends) through with its real
// status/message intact, but never leak a raw internal error message
// or stack trace for an actual 500.
function handleError(error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply): void {
  const statusCode = isFastifyError(error) ? (error.statusCode ?? 500) : 500;
  if (statusCode >= 500) {
    // Only genuine 500s, not every expected 4xx domain error
    // (AuthError and friends) - those are normal control flow, not
    // something worth an alert. Safe to call unconditionally: Sentry's
    // SDK no-ops if Sentry.init() was never called (index.ts only
    // calls it when SENTRY_DSN is actually configured - config.ts).
    Sentry.captureException(error);
    reply.code(statusCode).send({ statusCode, error: 'Internal Server Error', message: 'Something went wrong' });
    return;
  }
  const reason = reasonOf(error);
  reply.code(statusCode).send({ statusCode, error: error.name || 'Bad Request', message: error.message, ...(reason ? { reason } : undefined) });
}

export async function buildServer(
  config: AdminConfig = loadConfig(),
  deps: ServerDeps = defaultDeps(),
): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel,
      // Fastify's own request/response serializers include these
      // headers by default (the session cookie itself, and any
      // Authorization header) - redacted so a log line never carries
      // a live, replayable credential, not just avoiding a leak of
      // secret *values* elsewhere.
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    },
  });

  app.setErrorHandler(handleError);
  app.decorateRequest('currentUser', null);

  await app.register(fastifyHelmet);
  // Generous global default (this isn't the brute-force defence - the
  // specific login/signup/change-password routes set their own
  // stricter per-route limit below) - just a backstop against genuine
  // abuse/misbehaving clients hammering the API, without throttling
  // normal use (e.g. GET /api/auth/me, fetched on every page load).
  await app.register(fastifyRateLimit, { max: 300, timeWindow: '1 minute' });

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret: deps.sessionSecret,
    store: toSessionStore(deps.sessionRecordStore),
    cookie: {
      httpOnly: true,
      secure: 'auto',
      sameSite: 'lax',
    },
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(createAuthRoutes(deps.usersStore, deps.sessionRecordStore), { prefix: '/api/auth' });
  await app.register(createOAuthRoutes(deps.oauthProviders, deps.usersStore, deps.baseUrl), { prefix: '/api/auth' });
  await app.register(createSitesRoutes(deps.usersStore, deps.sitesStore, deps.siteAccessStore), { prefix: '/api/sites' });
  await app.register(createSiteUsersRoutes(deps.usersStore, deps.sitesStore, deps.siteAccessStore), {
    prefix: '/api/sites',
  });
  await app.register(
    createSiteInvitesRoutes(deps.usersStore, deps.sitesStore, deps.siteAccessStore, deps.siteInviteStore, deps.mailer, deps.baseUrl),
    { prefix: '/api/sites' },
  );
  await app.register(createInviteClaimRoutes(deps.usersStore, deps.sitesStore, deps.siteAccessStore, deps.siteInviteStore), {
    prefix: '/api/invites',
  });

  // Skipped when the web package hasn't been built yet (e.g. running
  // the backend's own tests, or `npm run dev`, where Vite serves the
  // frontend instead) - only the real production boot needs this.
  if (existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api')) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      // SPA client-side routing fallback: any non-API path that isn't
      // a real static file gets the app shell, which handles routing
      // itself.
      reply.sendFile('index.html', config.webDistDir);
    });
  }

  return app;
}
