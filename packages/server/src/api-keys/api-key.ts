import { createHash, randomBytes } from 'node:crypto';

// A personal API key: how an AI agent (the Granite MCP server) acts in
// the admin for one person, on chosen sites, with one permission level.
// Only a hash is kept - the key itself is shown once, when it's made -
// and the hash is the record's id, so a request's key is found with
// one lookup.
export type ApiKeyPermission = 'read' | 'draft' | 'publish';

export interface ApiKey {
  // sha256 hex of the key.
  id: string;
  userId: string;
  name: string;
  // The key's first characters, so a person can tell keys apart.
  prefix: string;
  siteIds: string[];
  permission: ApiKeyPermission;
  createdAt: string;
  lastUsedAt: string | null;
}

export const API_KEY_PREFIX = 'gck_';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; id: string; prefix: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, id: hashApiKey(key), prefix: key.slice(0, API_KEY_PREFIX.length + 6) };
}

export function isApiKeyPermission(value: unknown): value is ApiKeyPermission {
  return value === 'read' || value === 'draft' || value === 'publish';
}

const RANK: Record<ApiKeyPermission, number> = { read: 0, draft: 1, publish: 2 };

export function permits(granted: ApiKeyPermission, needed: ApiKeyPermission): boolean {
  return RANK[granted] >= RANK[needed];
}

// What an API key may call, and the permission each needs. Anything not
// listed is refused to every key, so a route added later is never open
// to agents by accident. Settings, menus and redirects need 'publish':
// they have no draft step, so saving one changes the live site. Deleting
// or moving pages, reverting, renaming menus, deleting media, and all
// site, team, account and key administration are never available to a
// key (agreed scope for the first version).
const ALLOWED: Record<string, ApiKeyPermission> = {
  'GET /api/sites': 'read',
  'GET /api/sites/:id/content': 'read',
  'GET /api/sites/:id/content/*': 'read',
  'GET /api/sites/:id/preview/*': 'read',
  'GET /api/sites/:id/preview-revision/:ref/*': 'read',
  'GET /api/sites/:id/history/*': 'read',
  'GET /api/sites/:id/revision/:ref/*': 'read',
  'GET /api/sites/:id/redirects': 'read',
  'GET /api/sites/:id/menus/references': 'read',
  'GET /api/sites/:id/settings': 'read',
  'GET /api/sites/:id/links': 'read',
  'GET /api/sites/:id/theme/schemas': 'read',
  'GET /api/sites/:id/theme/page-templates': 'read',
  'GET /api/sites/:id/media': 'read',
  'PUT /api/sites/:id/drafts/*': 'draft',
  'DELETE /api/sites/:id/drafts/*': 'draft',
  'POST /api/sites/:id/media': 'draft',
  'POST /api/sites/:id/publish': 'publish',
  'POST /api/sites/:id/publish-page/*': 'publish',
  'POST /api/sites/:id/unpublish/*': 'publish',
  'PUT /api/sites/:id/settings': 'publish',
  'PUT /api/sites/:id/menus/*': 'publish',
  'POST /api/sites/:id/redirects': 'publish',
  'PUT /api/sites/:id/redirects': 'publish',
  'DELETE /api/sites/:id/redirects': 'publish',
};

// null: not available to API keys at all.
export function permissionNeeded(method: string, routeUrl: string | undefined): ApiKeyPermission | null {
  return routeUrl === undefined ? null : (ALLOWED[`${method.toUpperCase()} ${routeUrl}`] ?? null);
}
