import { randomUUID } from 'node:crypto';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import type { SiteStore } from '../store/site-store.ts';
import type { SiteAccessStore } from '../store/site-access-store.ts';
import type { AdminUser } from '../auth/users.ts';
import { createRequireAuth, AuthError } from '../auth/require-auth.ts';
import { formatFullName } from '../auth/full-name.ts';
import { createRequireDeveloper } from '../auth/require-developer.ts';
import { createRequireSiteAccess } from '../auth/require-site-access.ts';
import type { Site } from '../sites/site.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { checkSiteStatus, type SiteStatus } from '../sites/site-status.ts';
import { fetchSiteContent, type ContentListFilters } from '../sites/site-content.ts';
import { fetchSiteEditorContent } from '../sites/site-editor-content.ts';
import { saveSiteDraft } from '../sites/site-draft-save.ts';
import { fetchSitePreview } from '../sites/site-preview.ts';
import { fetchSitePreviewRevision } from '../sites/site-preview-revision.ts';
import { publishSite } from '../sites/site-publish.ts';
import { discardSiteDraft } from '../sites/site-draft-discard.ts';
import { unpublishSite } from '../sites/site-unpublish.ts';
import type { CommitAuthor } from '../sites/commit-author.ts';
import { fetchSiteHistory } from '../sites/site-history.ts';
import { fetchSiteRevision } from '../sites/site-revision.ts';
import { revertSitePath } from '../sites/site-revert.ts';
import { moveSitePath } from '../sites/site-move.ts';
import { fetchSiteThemeSchemas } from '../sites/site-theme-schemas.ts';
import { fetchSitePageTemplates } from '../sites/site-page-templates.ts';
import { deleteSiteMedia, listSiteMedia, uploadSiteMedia } from '../sites/site-media.ts';
import { createSiteRedirect, deleteSiteRedirect, listSiteRedirects, updateSiteRedirect } from '../sites/site-redirects.ts';

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

interface MoveBody {
  from: string;
  to: string;
  message: string;
  createRedirect: boolean;
}

// createRedirect defaults false when absent - the Slug field's own
// rename-on-save call (PageMetadataPanel.tsx) never sends it at all,
// preserving its existing WordPress-style "no automatic redirect"
// behaviour exactly. The drag-and-drop reparent feature is the first
// caller that sends true - moving a page under a different parent
// changes its whole URL prefix, a bigger change than a same-parent
// slug edit and one a link elsewhere is more likely to break, so that
// feature always requests a redirect.
function parseMoveBody(body: unknown): MoveBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.from !== 'string' || record.from.trim() === '') {
    return null;
  }
  if (typeof record.to !== 'string' || record.to.trim() === '') {
    return null;
  }
  if (typeof record.message !== 'string' || record.message.trim() === '') {
    return null;
  }
  if (record.createRedirect !== undefined && typeof record.createRedirect !== 'boolean') {
    return null;
  }
  return { from: record.from, to: record.to, message: record.message, createRedirect: record.createRedirect === true };
}

interface UpsertRedirectBody {
  from: string;
  to: string;
  note?: string;
  message: string;
}

function parseUpsertRedirectBody(body: unknown): UpsertRedirectBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.from !== 'string' || record.from.trim() === '') {
    return null;
  }
  if (typeof record.to !== 'string' || record.to.trim() === '') {
    return null;
  }
  if (record.note !== undefined && typeof record.note !== 'string') {
    return null;
  }
  if (typeof record.message !== 'string' || record.message.trim() === '') {
    return null;
  }
  return { from: record.from, to: record.to, note: record.note, message: record.message };
}

interface DeleteRedirectBody {
  from: string;
  message: string;
}

function parseDeleteRedirectBody(body: unknown): DeleteRedirectBody | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.from !== 'string' || record.from.trim() === '') {
    return null;
  }
  if (typeof record.message !== 'string' || record.message.trim() === '') {
    return null;
  }
  return { from: record.from, message: record.message };
}

// The browser never supplies a commit author - it's always the
// logged-in admin's own stored identity (Group G groundwork). The
// null case is unreachable in practice (requireAuth always sets this
// first) but narrowed explicitly rather than asserted, matching this
// codebase's existing defensive style elsewhere.
function requireCommitAuthor(currentUser: Pick<AdminUser, 'firstName' | 'lastName' | 'email'> | null): CommitAuthor {
  if (!currentUser) {
    throw new AuthError('Login required');
  }
  return { name: formatFullName(currentUser.firstName, currentUser.lastName), email: currentUser.email };
}

// GET / client branch: resolves via the SiteAccess rows granted to
// this user, then fetches each referenced site - tolerating a
// since-deleted site by filtering out misses rather than throwing.
async function resolveClientSites(sitesStore: Store<Site>, siteAccessStore: SiteAccessStore, userId: string): Promise<Site[]> {
  const grants = await siteAccessStore.listByUser(userId);
  const sites = await Promise.all(grants.map((grant) => sitesStore.find(grant.siteId)));
  return sites.filter((site): site is Site => site !== undefined);
}

export function createSitesRoutes(usersStore: Store<AdminUser>, sitesStore: SiteStore, siteAccessStore: SiteAccessStore) {
  const requireAuth = createRequireAuth(usersStore);
  const requireDeveloper = createRequireDeveloper();
  const requireSiteAccess = createRequireSiteAccess(sitesStore, siteAccessStore, (request) => (request.params as { id: string }).id);

  return async function sitesRoutes(app: FastifyInstance): Promise<void> {
    // C1, C2, C5: the list itself performs a fresh, parallel status
    // check on every request - no cached status field anywhere.
    app.get('/', { preHandler: requireAuth }, async (request) => {
      const user = request.currentUser!;
      const sites =
        user.role === 'developer' ? await sitesStore.listByOwner(user.id) : await resolveClientSites(sitesStore, siteAccessStore, user.id);
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
      { preHandler: [requireAuth, requireSiteAccess] },
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
      { preHandler: [requireAuth, requireSiteAccess] },
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
      { preHandler: [requireAuth, requireSiteAccess] },
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
          return { statusCode: 400, error: 'Bad Request', message: result.message, errors: result.errors };
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
      // contentSecurityPolicy: false - this route deliberately serves
      // another origin's rendered HTML for the browser to load into an
      // iframe (fetchSitePreview injects a <base href> pointing at the
      // real site origin so its relative asset paths resolve
      // correctly). The admin's global CSP's default base-uri 'self'
      // silently blocks that <base> tag from taking effect at all,
      // which then breaks every relative asset reference (they fall
      // back to resolving against the admin's own domain instead).
      // Safe to relax only here: the iframe boundary is the real
      // isolation, and the site's own API token never reaches the
      // browser regardless (fetchSitePreview attaches it server-side
      // via fetchSite's authToken option, never passed to the client).
      { preHandler: [requireAuth, requireSiteAccess], helmet: { contentSecurityPolicy: false } },
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

    // A distinct top-level segment ("preview-revision", not nested
    // under /:id/preview/*) for the same reason the agent's own
    // GET /v1/preview-revision/:ref/* route isn't nested under
    // GET /v1/preview/* - see that route's own comment. Outcome
    // mapping mirrors /:id/revision/:ref/* below (invalid-ref/
    // not-found-at-ref kept distinct), plus the new 'unrenderable'
    // case for a revision whose content no longer matches the site's
    // current theme.
    app.get<{ Params: { id: string; ref: string; '*': string } }>(
      '/:id/preview-revision/:ref/*',
      // contentSecurityPolicy: false - same reasoning as
      // GET /:id/preview/* above (fetchSitePreviewRevision injects the
      // same <base> tag fix, blocked the same way by the default CSP's
      // base-uri 'self').
      { preHandler: [requireAuth, requireSiteAccess], helmet: { contentSecurityPolicy: false } },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const result = await fetchSitePreviewRevision(site, `/${request.params['*']}`, request.params.ref);

        if (result.outcome === 'ok') {
          reply.code(result.status).type(result.contentType).send(Buffer.from(result.body));
          return;
        }
        if (result.outcome === 'invalid-ref') {
          reply.code(400);
          return { statusCode: 400, error: 'Bad Request', message: result.message };
        }
        if (result.outcome === 'not-found-at-ref') {
          reply.code(404);
          return { error: result.message, reason: 'not-found-at-ref' };
        }
        if (result.outcome === 'unrenderable') {
          reply.code(422);
          return { error: result.message, reason: 'unrenderable' };
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
      { preHandler: [requireAuth, requireSiteAccess] },
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
    app.post<{ Params: { id: string } }>('/:id/publish', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
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
      { preHandler: [requireAuth, requireSiteAccess] },
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
      { preHandler: [requireAuth, requireSiteAccess] },
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
      { preHandler: [requireAuth, requireSiteAccess] },
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
    app.post<{ Params: { id: string } }>('/:id/revert', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
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

    // Backs both the Slug field's rename-on-save (PageMetadataPanel.tsx,
    // createRedirect omitted/false) and the page tree's drag-to-reparent
    // feature (PagesTabPanel.tsx, createRedirect: true) - same author-
    // from-session, not-from-body rule as revert/publish either way.
    app.post<{ Params: { id: string } }>('/:id/move', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const body = parseMoveBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'from, to, and message are all required' };
      }

      const author = requireCommitAuthor(request.currentUser);
      const result = await moveSitePath(site, body.from, body.to, body.message, author, { createRedirect: body.createRedirect });

      if (result.outcome === 'ok') {
        return { ok: true };
      }
      if (result.outcome === 'source-not-found') {
        reply.code(404);
        return { error: result.message, reason: 'source-not-found' };
      }
      if (result.outcome === 'destination-exists') {
        reply.code(409);
        return { statusCode: 409, error: 'Conflict', message: result.message };
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    // from/to/note all travel in the body on every verb below, never a
    // URL path segment - they're arbitrary public URLs that may
    // contain slashes, matching /:id/move's own precedent above and
    // the agent's own POST /v1/content/move route.
    app.get<{ Params: { id: string } }>('/:id/redirects', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const result = await listSiteRedirects(site);
      if (result.outcome === 'ok') {
        return { entries: result.entries };
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    app.post<{ Params: { id: string } }>('/:id/redirects', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const body = parseUpsertRedirectBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'from, to, and message are all required' };
      }

      const author = requireCommitAuthor(request.currentUser);
      const result = await createSiteRedirect(site, body.from, body.to, body.note, body.message, author);

      if (result.outcome === 'ok') {
        return { entry: result.entry, retargeted: result.retargeted };
      }
      if (result.outcome === 'invalid') {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: result.message };
      }
      if (result.outcome === 'conflict') {
        reply.code(409);
        return { statusCode: 409, error: 'Conflict', message: result.message };
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    // PUT matches the existing entry by from - there is no rename-from
    // operation, from is the entry's own key (see site-redirects.ts).
    app.put<{ Params: { id: string } }>('/:id/redirects', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const body = parseUpsertRedirectBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'from, to, and message are all required' };
      }

      const author = requireCommitAuthor(request.currentUser);
      const result = await updateSiteRedirect(site, body.from, body.to, body.note, body.message, author);

      if (result.outcome === 'ok') {
        return { entry: result.entry, retargeted: result.retargeted };
      }
      if (result.outcome === 'invalid') {
        reply.code(400);
        return { statusCode: 400, error: 'Bad Request', message: result.message };
      }
      if (result.outcome === 'not-found') {
        reply.code(404);
        return { error: result.message, reason: 'not-found' };
      }
      if (result.outcome === 'conflict') {
        reply.code(409);
        return { statusCode: 409, error: 'Conflict', message: result.message };
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    app.delete<{ Params: { id: string } }>('/:id/redirects', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const body = parseDeleteRedirectBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'from and message are both required' };
      }

      const author = requireCommitAuthor(request.currentUser);
      const result = await deleteSiteRedirect(site, body.from, body.message, author);

      if (result.outcome === 'ok') {
        return reply.code(204).send();
      }
      if (result.outcome === 'not-found') {
        reply.code(404);
        return { error: result.message, reason: 'not-found' };
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    // I2, I3, I4: what the schema-driven section/block editor is
    // built from - a single read-only pass-through, no query params.
    app.get<{ Params: { id: string } }>('/:id/theme/schemas', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      const result = await fetchSiteThemeSchemas(site);
      if (result.outcome === 'ok') {
        return result.schemas;
      }

      reply.code(502);
      return { error: result.message, reason: result.outcome };
    });

    // Group Q: what the admin's New Page template picker is built from -
    // same single read-only pass-through as /theme/schemas above, no
    // dedicated "create from template" route needed (that's just the
    // existing PUT /:id/drafts/* with the chosen template's own content).
    app.get<{ Params: { id: string } }>(
      '/:id/theme/page-templates',
      { preHandler: [requireAuth, requireSiteAccess] },
      async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const result = await fetchSitePageTemplates(site);
        if (result.outcome === 'ok') {
          return { templates: result.templates };
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      },
    );

    // Media routes live in their own nested plugin, not registered
    // directly on `app` above: Fastify's register() gives a nested
    // plugin its own encapsulation context, so registering
    // @fastify/multipart only here scopes its content-type parser and
    // request.file() decoration to just these three routes, leaving
    // every other /api/sites/* route's default JSON body parsing
    // completely untouched. Kept inside this same file rather than a
    // new routes/media.ts - routes/ has no existing per-concern file
    // split for site-scoped routes, every other concern here
    // (content, drafts, preview, history, theme schemas) already
    // shares this one file's sitesStore/requireAuth closure, and
    // splitting only media out would be a larger, unrequested
    // structural change.
    await app.register(async (mediaRoutes) => {
      // A defensive-only ceiling on the admin's own incoming upload,
      // independent of any specific site's real configured cap (which
      // is enforced authoritatively agent-side and forwarded back as a
      // real 413 by uploadSiteMedia). 20MB, generously above any
      // realistic web image.
      await mediaRoutes.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

      mediaRoutes.get<{ Params: { id: string } }>('/:id/media', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
        const site = await sitesStore.find(request.params.id);
        if (!site) {
          throw new SiteNotFoundError(request.params.id);
        }

        const result = await listSiteMedia(site);
        if (result.outcome === 'ok') {
          return { items: result.items, maxUploadBytes: result.maxUploadBytes };
        }

        reply.code(502);
        return { error: result.message, reason: result.outcome };
      });

      mediaRoutes.post<{ Params: { id: string } }>(
        '/:id/media',
        { preHandler: [requireAuth, requireSiteAccess] },
        async (request, reply) => {
          const site = await sitesStore.find(request.params.id);
          if (!site) {
            throw new SiteNotFoundError(request.params.id);
          }

          // A RequestFileTooLargeError from the ceiling registered
          // above already carries its own .statusCode (413) - thrown
          // straight through to the app's existing global error
          // handler unchanged, no special catch needed here, same
          // precedent already confirmed agent-side for the identical
          // situation.
          const data = await request.file();
          if (!data) {
            reply.code(400);
            return { statusCode: 400, error: 'Bad Request', message: 'Expected a multipart file upload' };
          }
          const bytes = await data.toBuffer();

          const result = await uploadSiteMedia(site, data.filename, bytes);
          if (result.outcome === 'ok') {
            reply.code(201);
            return { name: result.name, size: result.size, url: result.url };
          }
          if (result.outcome === 'unsupported-type') {
            reply.code(415);
            return { statusCode: 415, error: 'Unsupported Media Type', message: result.message };
          }
          if (result.outcome === 'too-large') {
            reply.code(413);
            return { statusCode: 413, error: 'Payload Too Large', message: result.message };
          }

          reply.code(502);
          return { error: result.message, reason: result.outcome };
        },
      );

      // Wildcard, not a named :name param - mirrors this file's own
      // /:id/drafts/* precedent and the agent's own DELETE
      // /v1/media/* route.
      mediaRoutes.delete<{ Params: { id: string; '*': string } }>(
        '/:id/media/*',
        { preHandler: [requireAuth, requireSiteAccess] },
        async (request, reply) => {
          const site = await sitesStore.find(request.params.id);
          if (!site) {
            throw new SiteNotFoundError(request.params.id);
          }

          const result = await deleteSiteMedia(site, request.params['*']);
          if (result.outcome === 'ok') {
            return reply.code(204).send();
          }
          if (result.outcome === 'not-found') {
            reply.code(404);
            return { statusCode: 404, error: 'Not Found', message: result.message };
          }

          reply.code(502);
          return { error: result.message, reason: result.outcome };
        },
      );
    });

    // C1: never gated on reachability - the registry is metadata
    // only (C4), so a site with a bad URL/token is still registered
    // and just shows an unreachable/unauthorized status from then on.
    app.post('/', { preHandler: [requireAuth, requireDeveloper] }, async (request, reply) => {
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
        ownerId: request.currentUser!.id,
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
    app.put<{ Params: { id: string } }>('/:id/token', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
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
    app.delete<{ Params: { id: string } }>('/:id', { preHandler: [requireAuth, requireSiteAccess] }, async (request, reply) => {
      const site = await sitesStore.find(request.params.id);
      if (!site) {
        throw new SiteNotFoundError(request.params.id);
      }

      await sitesStore.delete(request.params.id);
      return reply.code(204).send();
    });
  };
}
