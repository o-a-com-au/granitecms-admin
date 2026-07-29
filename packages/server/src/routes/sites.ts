import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Store } from '../store/store.ts';
import type { AdminUser } from '../auth/users.ts';
import { createRequireAuth } from '../auth/require-auth.ts';
import type { Site } from '../sites/site.ts';
import { SiteNotFoundError } from '../sites/site-not-found-error.ts';
import { checkSiteStatus, type SiteStatus } from '../sites/site-status.ts';
import { fetchSiteContent, type ContentListFilters } from '../sites/site-content.ts';
import { fetchSiteEditorContent } from '../sites/site-editor-content.ts';
import { saveSiteDraft } from '../sites/site-draft-save.ts';

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
