import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ApiKeyStore } from '../store/api-key-store.ts';
import type { SiteStore } from '../store/site-store.ts';
import type { UserStore } from '../store/user-store.ts';
import { planOf } from '../auth/users.ts';
import { API_KEY_PREFIX, hashApiKey, permissionNeeded, permits, type ApiKey } from './api-key.ts';

declare module 'fastify' {
  interface FastifyRequest {
    // The API key a request authenticated with, when it did.
    apiKey: ApiKey | null;
  }
}

// How often a key's lastUsedAt is written: often enough to be useful,
// not on every one of an agent's many requests.
const LAST_USED_EVERY_MS = 60_000;

function refuse(reply: FastifyReply, status: number, error: string, reason: string): FastifyReply {
  return reply.code(status).send({ error, reason });
}

// API keys (api-key.ts): a request with "Authorization: Bearer gck_..."
// acts as the key's owner, but only on a route the key's permission
// allows, only on the key's own sites, and only while each such site's
// owner is on the Pro plan - all checked here, before any route runs.
// requireAuth then takes the user from request.apiKey instead of the
// session (require-auth.ts), and every other check (site access, paused
// accounts) applies as it would to that person.
export function registerApiKeyAuth(
  app: FastifyInstance,
  stores: { apiKeyStore: ApiKeyStore; sitesStore: SiteStore; usersStore: UserStore },
): void {
  app.decorateRequest('apiKey', null);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return;
    }
    const presented = header.slice('Bearer '.length).trim();
    const key = presented.startsWith(API_KEY_PREFIX) ? await stores.apiKeyStore.find(hashApiKey(presented)) : undefined;
    if (!key) {
      return refuse(reply, 401, 'That API key is not valid', 'invalid-api-key');
    }

    const needed = permissionNeeded(request.method, request.routeOptions.url);
    if (needed === null) {
      return refuse(reply, 403, 'API keys cannot be used for this', 'not-available-to-api-keys');
    }
    if (!permits(key.permission, needed)) {
      return refuse(reply, 403, `This API key can only ${key.permission === 'read' ? 'read' : 'save drafts'}`, 'insufficient-permission');
    }

    const siteId = (request.params as { id?: unknown } | undefined)?.id;
    if (typeof siteId === 'string') {
      const site = key.siteIds.includes(siteId) ? await stores.sitesStore.find(siteId) : undefined;
      if (!site) {
        return refuse(reply, 404, 'Site not found', 'not-found');
      }
      const owner = await stores.usersStore.find(site.ownerId);
      if (!owner || planOf(owner) !== 'pro') {
        return refuse(reply, 403, 'AI agent access needs the Pro plan', 'plan-required');
      }
    }

    request.apiKey = key;
    if (!key.lastUsedAt || Date.now() - Date.parse(key.lastUsedAt) > LAST_USED_EVERY_MS) {
      await stores.apiKeyStore.save({ ...key, lastUsedAt: new Date().toISOString() });
    }
  });
}
