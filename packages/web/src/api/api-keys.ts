// Personal API keys for AI agents (the server's /api/api-keys): each
// person's own, for sites they can reach whose owner is on Pro.

export type ApiKeyPermission = 'read' | 'draft' | 'publish';

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  siteIds: string[];
  permission: ApiKeyPermission;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiKeysData {
  keys: ApiKeyView[];
  // Sites a new key can be given; empty when there are none on Pro.
  eligibleSites: Array<{ id: string; url: string }>;
}

async function errorFrom(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: string };
    return new Error(body.error ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function listApiKeys(): Promise<ApiKeysData> {
  const response = await fetch('/api/api-keys');
  if (!response.ok) {
    throw await errorFrom(response, 'Could not load your API keys');
  }
  return (await response.json()) as ApiKeysData;
}

// The key itself comes back only here, once.
export async function createApiKey(input: { name: string; siteIds: string[]; permission: ApiKeyPermission }): Promise<{ key: string; apiKey: ApiKeyView }> {
  const response = await fetch('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await errorFrom(response, 'Could not create the API key');
  }
  return (await response.json()) as { key: string; apiKey: ApiKeyView };
}

export async function revokeApiKey(id: string): Promise<void> {
  const response = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) {
    throw await errorFrom(response, 'Could not revoke the API key');
  }
}
