import type { FastifyInstance } from 'fastify';
import { createRequireAuth } from '../auth/require-auth.ts';
import { planOf } from '../auth/users.ts';
import { generateApiKey, isApiKeyPermission, type ApiKey } from '../api-keys/api-key.ts';
import type { ApiKeyStore } from '../store/api-key-store.ts';
import type { SiteAccessStore } from '../store/site-access-store.ts';
import type { SiteStore } from '../store/site-store.ts';
import type { UserStore } from '../store/user-store.ts';
import type { Site } from '../sites/site.ts';

// Personal API keys for AI agents (api-keys/api-key.ts): each person
// manages their own. Only from a login - an API key can't reach these
// routes (they're not on api-key.ts's list), so a key can never make
// or keep alive another key.

const MAX_KEYS_PER_USER = 20;
const MAX_NAME_LENGTH = 60;

// What the admin shows about a key - never its hash.
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  siteIds: string[];
  permission: ApiKey['permission'];
  createdAt: string;
  lastUsedAt: string | null;
}

function toView(key: ApiKey): ApiKeyView {
  // The id is the key's hash; revoking needs some handle on the key,
  // and a sha256 of a random 32-byte secret reveals nothing about it.
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    siteIds: key.siteIds,
    permission: key.permission,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  };
}

export function createApiKeyRoutes(usersStore: UserStore, sitesStore: SiteStore, siteAccessStore: SiteAccessStore, apiKeyStore: ApiKeyStore) {
  const requireAuth = createRequireAuth(usersStore);

  // The sites this person may give a key to: ones they can reach, whose
  // owner is on the Pro plan (AI agent access is a Pro feature).
  async function eligibleSites(user: { id: string; role: string }): Promise<Site[]> {
    const reachable =
      user.role === 'developer'
        ? await sitesStore.listByOwner(user.id)
        : (await Promise.all((await siteAccessStore.listByUser(user.id)).map((grant) => sitesStore.find(grant.siteId)))).filter(
            (site): site is Site => site !== undefined,
          );
    const onPro = await Promise.all(reachable.map(async (site) => planOf((await usersStore.find(site.ownerId)) ?? {}) === 'pro'));
    return reachable.filter((_site, index) => onPro[index]);
  }

  return async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
    app.get('/', { preHandler: requireAuth }, async (request) => {
      const user = request.currentUser!;
      const [keys, sites] = await Promise.all([apiKeyStore.listByUser(user.id), eligibleSites(user)]);
      return {
        keys: keys.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toView),
        // Where a new key can go; empty means none (not on Pro).
        eligibleSites: sites.map((site) => ({ id: site.id, url: site.url })),
      };
    });

    app.post('/', { preHandler: requireAuth }, async (request, reply) => {
      const user = request.currentUser!;
      const body = (request.body ?? {}) as { name?: unknown; siteIds?: unknown; permission?: unknown };
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name === '' || name.length > MAX_NAME_LENGTH) {
        reply.code(400);
        return { error: `Give the key a name of up to ${MAX_NAME_LENGTH} characters.`, reason: 'invalid' };
      }
      if (!isApiKeyPermission(body.permission)) {
        reply.code(400);
        return { error: 'Choose what the key may do.', reason: 'invalid' };
      }
      const allowed = new Set((await eligibleSites(user)).map((site) => site.id));
      if (allowed.size === 0) {
        reply.code(403);
        return { error: 'AI agent access needs the Pro plan', reason: 'plan-required' };
      }
      const siteIds = Array.isArray(body.siteIds) ? [...new Set(body.siteIds.filter((id): id is string => typeof id === 'string'))] : [];
      if (siteIds.length === 0 || siteIds.some((id) => !allowed.has(id))) {
        reply.code(400);
        return { error: 'Choose one or more of your Pro sites for the key.', reason: 'invalid' };
      }
      if ((await apiKeyStore.listByUser(user.id)).length >= MAX_KEYS_PER_USER) {
        reply.code(400);
        return { error: `You can have up to ${MAX_KEYS_PER_USER} API keys. Revoke one you no longer use first.`, reason: 'too-many' };
      }

      const { key, id, prefix } = generateApiKey();
      const record: ApiKey = {
        id,
        userId: user.id,
        name,
        prefix,
        siteIds,
        permission: body.permission,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      await apiKeyStore.save(record);
      reply.code(201);
      // The only time the key itself is ever sent.
      return { key, apiKey: toView(record) };
    });

    app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAuth }, async (request, reply) => {
      const key = await apiKeyStore.find(request.params.id);
      if (!key || key.userId !== request.currentUser!.id) {
        reply.code(404);
        return { error: 'API key not found', reason: 'not-found' };
      }
      await apiKeyStore.delete(key.id);
      reply.code(204);
      return null;
    });
  };
}
