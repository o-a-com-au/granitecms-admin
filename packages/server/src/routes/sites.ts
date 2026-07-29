import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import type { AdminUser } from '../auth/users.ts';
import { createRequireAuth, AuthError } from '../auth/require-auth.ts';
import type { Site } from '../sites/site.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { checkSiteStatus, type SiteStatus } from '../sites/site-status.ts';
import { fetchSiteContent, type ContentListFilters } from '../sites/site-content.ts';
import { fetchSiteEditorContent } from '../sites/site-editor-content.ts';
import { saveSiteDraft } from '../sites/site-draft-save.ts';
import { fetchSitePreview } from '../sites/site-preview.ts';
import { publishSite } from '../sites/site-publish.ts';
import { discardSiteDraft } from '../sites/site-draft-discard.ts';
import { unpublishSite } from '../sites/site-unpublish.ts';
import type { CommitAuthor } from '../sites/commit-author.ts';
import { fetchSiteHistory } from '../sites/site-history.ts';
import { fetchSiteRevision } from '../sites/site-revision.ts';
import { revertSitePath } from '../sites/site-revert.ts';

// The raw token is never included here, full stop - built by this
// explicit mapping function rather than spreading the Site record, so
// a future refactor can't accidentally start leaking it to the
// browser.
export interface SiteListEntry {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: SiteStatus;
}

function toSiteListEntry(site: Site, status: SiteStatus): SiteListEntry {
  return {
    id: site.id,
    url: site.url,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    status,
  };
}

interface RegisterSiteBody {
  url: string;
  token: string;
}

function parseRegisterSiteBody(body: unknown): RegisterSiteBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.url !== 'string' || typeof record.token !== 'string') {
    return null;
  }
  if (record.url.trim() === '' || record.token.trim() === '') {
    return null;
  }
  return { url: record.url, token: record.token };
}

function parseSiteUrl(input: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return parsed;
}

interface ContentQuery {
  type?: string;
  prefix?: string;
  draftStatus?: string;
}

// D2: forwarded verbatim to match what GET /v1/content already
// supports server-side. type/prefix are opaque, content-defined
// strings on the agent side, not enums - only draftStatus has a
// closed set of valid values worth rejecting early.
function parseContentFilters(query: ContentQuery): ContentListFilters | null {
  if (query.draftStatus !== undefined && query.draftStatus !== 'has-draft' && query.draftStatus !== 'no-draft') {
    return null;
  }
  const filters: ContentListFilters = {};
  if (query.type) {
    filters.type = query.type;
  }
  if (query.prefix) {
    filters.prefix = query.prefix;
  }
  if (query.draftStatus) {
    filters.draftStatus = query.draftStatus;
  }
  return filters;
}

interface RotateTokenBody {
  token: string;
}

function parseRotateTokenBody(body: unknown): RotateTokenBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.token !== 'string' || record.token.trim() === '') {
    return null;
  }
  return { token: record.token };
}

interface PublishBody {
  path: string;
  message: string;
}

// G1: this UI is single-page-publish only (no multi-select), so the
// browser sends one path, not the batch array the agent's own route
// actually accepts - that batching is reconstructed at the call site.
function parsePublishBody(body: unknown): PublishBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.path !== 'string' || record.path.trim() === '') {
    return null;
  }
  if (typeof record.message !== 'string' || record.message.trim() === '') {
    return null;
  }
  return { path: record.path, message: record.message };
}

interface UnpublishBody {
  message: string;
}

function parseUnpublishBody(body: unknown): UnpublishBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.message !== 'string' || record.message.trim() === '') {
    return null;
  }
  return { message: record.message };
}

interface HistoryQuery {
  limit?: string;
}

const DEFAULT_HISTORY_LIMIT = 100;

// H1: checked here, before ever calling the site - mirrors the
// agent's own handleGitLog validation and this file's own If-Match
// fail-fast precedent, rather than letting the site reject it.
function parseHistoryLimit(query: HistoryQuery): number | null {
  if (query.limit === undefined) {
    return DEFAULT_HISTORY_LIMIT;
  }
  const parsed = Number(query.limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

interface RevertBody {
  ref: string;
  path: string;
  message: string;
}

function parseRevertBody(body: unknown): RevertBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.ref !== 'string' || record.ref.trim() === '') {
    return null;
  }
  if (typeof record.path !== 'string' || record.path.trim() === '') {
    return null;
  }
  if (typeof record.message !== 'string' || record.message.trim() === '') {
    return null;
  }
  return { ref: record.ref, path: record.path, message: record.message };
}

// The browser never supplies a commit author - it's always the
// logged-in admin's own stored identity (Group G groundwork). The
// null case is unreachable in practice (requireAuth always sets this
// first) but narrowed explicitly rather than asserted, matching this
// codebase's existing defensive style elsewhere.
function requireCommitAuthor(currentUser: Pick<AdminUser, 'name' | 'email'> | null): CommitAuthor {
  if (!currentUser) {
    throw new AuthError('Login required');
  }
  return { name: currentUser.name, email: currentUser.email };
}

export function createSitesRoutes(usersStore: Store<AdminUser>, sitesStore: Store<Site>) {
  const requireAuth = createRequireAuth(usersStore);

  return async function sitesRoutes(app: FastifyInstance): Promise<void> {
    // C1, C2, C5: the list itself performs a fresh, parallel status
    // check on every request - no cached status field anywhere.
    app.get('/', { preHandler: requireAuth }, async () => {
      const sites = await sitesStore.list();
      return Promise.all(sites.map(async (site) => toSiteListEntry(site, await checkSiteStatus(site))));
    });

    // D1, D2: a single live call - unlike checkSiteStatus, this is
    // calling the real resource it actually wants, so that call's own
    // outcome already tells us everything needed. 502 (not a reused
    // 401) for every failure bucket: this route genuinely is a
    // gateway to another server, and 401 already means one specific
    // thing everywhere else in this codebase - the caller's own admin
    // session. The reason field, not the HTTP status, is what the
    // frontend branches on.
    app.get<{ Params: { id: string }; Querystring: ContentQuery }>(
      '/:id/content',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const filters = parseContentFilters(request.query);
        if (!filters) {
          reply.code(400);
          return { error: 'draftStatus must be "has-draft" or "no-draft"' };
        }

        const result = await fetchSiteContent(site, filters);
        if (result.outcome === 'ok') {
          return result.entries;
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // E1: draft-if-one-exists-else-live. The success body is the raw
    // bytes the site returned, byte-for-byte - metadata (etag, which
    // of draft/live it came from) lives in headers, never folded into
    // the document itself.
    app.get<{ Params: { id: string; '*': string } }>(
      '/:id/content/*',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const result = await fetchSiteEditorContent(site, request.params['*']);

        if (result.outcome === 'ok') {
          reply.header('etag', result.etag);
          reply.header('x-content-source', result.source);
          reply.type('application/json; charset=utf-8');
          return Buffer.from(result.body);
        }
        if (result.outcome === 'not-found') {
          reply.code(404);
          return { error: 'No content at this path', reason: 'not-found' };
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // E2, E3, E4, E6: If-Match presence is checked here, before ever
    // calling the site - fails fast on an obviously-invalid request,
    // mirroring requireAuth's own precedent. Everything the site
    // itself decides (200/409/400) is forwarded verbatim by
    // saveSiteDraft/interpretSiteResponse, never reinterpreted here.
    app.put<{ Params: { id: string; '*': string } }>(
      '/:id/drafts/*',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const ifMatch = request.headers['if-match'];
        if (typeof ifMatch !== 'string' || ifMatch.trim() === '') {
          reply.code(428);
          return {
            statusCode: 428,
            error: 'Precondition Required',
            message: 'An If-Match header is required to save a draft',
          };
        }

        const content = JSON.stringify(request.body);
        const result = await saveSiteDraft(site, request.params['*'], content, ifMatch);

        if (result.outcome === 'ok') {
          reply.header('etag', result.etag);
          return { ok: true };
        }
        if (result.outcome === 'conflict') {
          reply.code(409);
          return { statusCode: 409, error: 'Conflict', message: result.message };
        }
        if (result.outcome === 'invalid') {
          reply.code(400);
          return { statusCode: 400, error: 'Bad Request', message: result.message };
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // F1, F3, F4: the site's real rendered response, forwarded
    // verbatim - status and content-type included, never
    // reinterpreted. This is what makes the preview genuine: the site
    // already did its own draft-over-live overlay (and its own 404
    // when neither exists), so there is nothing left for the admin to
    // decide here.
    app.get<{ Params: { id: string; '*': string } }>(
      '/:id/preview/*',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const result = await fetchSitePreview(site, `/${request.params['*']}`);

        if (result.outcome === 'ok') {
          reply.code(result.status).type(result.contentType).send(Buffer.from(result.body));
          return;
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // G3: DELETE is already idempotent on the agent side (204 whether
    // or not a draft existed) and never commits - nothing to check
    // before calling, unlike the PUT above's If-Match precondition.
    app.delete<{ Params: { id: string; '*': string } }>(
      '/:id/drafts/*',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const result = await discardSiteDraft(site, request.params['*']);
        if (result.outcome === 'ok') {
          return reply.code(204).send();
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // G1: single-page publish from the browser's point of view - the
    // path/message are wrapped into the agent's real batch shape here,
    // and the commit author always comes from the logged-in admin's
    // own identity, never the request body.
    app.post<{ Params: { id: string } }>('/:id/publish', { preHandler: requireAuth }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const body = parsePublishBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'path and message are both required' };
      }

      const author = requireCommitAuthor(request.currentUser);
      const result = await publishSite(site, [body.path], body.message, author);

      if (result.outcome === 'ok') {
        return { ok: true };
      }
      if (result.outcome === 'invalid') {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: result.message };
      }
      if (result.outcome === 'not-found') {
        reply.code(404);
        return { error: result.message, reason: 'not-found' };
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    // G4: unpublish sets published:false on the live file in place
    // (the site never deletes it) and commits - same author/response
    // shape as publish.
    app.post<{ Params: { id: string; '*': string } }>(
      '/:id/unpublish/*',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const body = parseUnpublishBody(request.body);
        if (!body) {
          reply.code(400);
          return { error: 'message is required' };
        }

        const author = requireCommitAuthor(request.currentUser);
        const result = await unpublishSite(site, request.params['*'], body.message, author);

        if (result.outcome === 'ok') {
          return { ok: true };
        }
        if (result.outcome === 'invalid') {
          reply.code(400);
          return { statusCode: 400, error: 'Bad Request', message: result.message };
        }
        if (result.outcome === 'not-found') {
          reply.code(404);
          return { error: result.message, reason: 'not-found' };
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // H1: flat, top-level route (not nested under a shared "/history"
    // prefix with the two routes below) - a real page path could
    // otherwise collide with a static route segment and be silently
    // misrouted, since find-my-way prefers a more specific static
    // match over a wildcard sibling at the same prefix.
    app.get<{ Params: { id: string; '*': string }; Querystring: HistoryQuery }>(
      '/:id/history/*',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const limit = parseHistoryLimit(request.query);
        if (limit === null) {
          reply.code(400);
          return { error: '"limit" must be a positive integer' };
        }

        const result = await fetchSiteHistory(site, request.params['*'], limit);
        if (result.outcome === 'ok') {
          return { commits: result.commits, hasMore: result.hasMore };
        }
        if (result.outcome === 'not-found') {
          reply.code(404);
          return { error: result.message, reason: 'not-found' };
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // H3: ref="HEAD" here is the entire "compare against current"
    // mechanism - the same route serves any real commit hash too.
    // invalid-ref/not-found-at-ref are forwarded as distinct
    // statuses, matching the agent's own deliberate non-collapse.
    app.get<{ Params: { id: string; ref: string; '*': string } }>(
      '/:id/revision/:ref/*',
      { preHandler: requireAuth },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const result = await fetchSiteRevision(site, request.params.ref, request.params['*']);

        if (result.outcome === 'ok') {
          reply.type('application/json; charset=utf-8');
          return Buffer.from(result.body);
        }
        if (result.outcome === 'invalid-ref') {
          reply.code(400);
          return { statusCode: 400, error: 'Bad Request', message: result.message };
        }
        if (result.outcome === 'not-found-at-ref') {
          reply.code(404);
          return { error: result.message, reason: 'not-found-at-ref' };
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // H4: always a new commit on the agent side - history is never
    // rewritten. Same author-from-session, not-from-body rule as
    // publish/unpublish.
    app.post<{ Params: { id: string } }>('/:id/revert', { preHandler: requireAuth }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const body = parseRevertBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'ref, path, and message are all required' };
      }

      const author = requireCommitAuthor(request.currentUser);
      const result = await revertSitePath(site, body.ref, body.path, body.message, author);

      if (result.outcome === 'ok') {
        return { ok: true };
      }
      if (result.outcome === 'invalid-ref') {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: result.message };
      }
      if (result.outcome === 'not-found-at-ref') {
        reply.code(404);
        return { error: result.message, reason: 'not-found-at-ref' };
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    // C1: never gated on reachability - the registry is metadata
    // only (C4), so a site with a bad URL/token is still registered
    // and just shows an unreachable/unauthorized status from then on.
    app.post('/', { preHandler: requireAuth }, async (request, reply) => {
      const body = parseRegisterSiteBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'url and token are both required' };
      }

      const parsedUrl = parseSiteUrl(body.url);
      if (!parsedUrl) {
        reply.code(400);
        return { error: 'url must use the http or https scheme' };
      }

      const now = new Date().toISOString();
      const site: Site = {
        id: randomUUID(),
        url: parsedUrl.origin,
        token: body.token,
        createdAt: now,
        updatedAt: now,
      };
      await sitesStore.save(site);

      const status = await checkSiteStatus(site);
      reply.code(201);
      return toSiteListEntry(site, status);
    });

    // C3: a pure overwrite. The old token never reached the browser
    // to begin with, so there is nothing to look up or echo back -
    // only the new value, entered fresh by the operator.
    app.put<{ Params: { id: string } }>('/:id/token', { preHandler: requireAuth }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const body = parseRotateTokenBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'token is required' };
      }

      const updated: Site = { ...site, token: body.token, updatedAt: new Date().toISOString() };
      await sitesStore.save(updated);

      const status = await checkSiteStatus(updated);
      return toSiteListEntry(updated, status);
    });

    // C4: no outbound fetch anywhere in this handler - "removal never
    // touches the site" is structurally true by construction, not
    // just by convention.
    app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      await sitesStore.delete(request.params.id);
      return reply.code(204).send();
    });
  };
}
