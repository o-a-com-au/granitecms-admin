export type SiteStatus =
  | { state: 'ok'; agentVersion: string; contentSchemaVersion: number; sqliteDriver: string }
  | { state: 'unreachable'; message: string }
  | { state: 'unauthorized'; message: string }
  | { state: 'error'; message: string };

export interface SiteListEntry {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: SiteStatus;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function listSites(): Promise<SiteListEntry[]> {
  const response = await fetch('/api/sites');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load websites'));
  }
  return (await response.json()) as SiteListEntry[];
}

export async function registerSite(url: string, token: string): Promise<SiteListEntry> {
  const response = await fetch('/api/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, token }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to register the website'));
  }
  return (await response.json()) as SiteListEntry;
}

export async function rotateSiteToken(id: string, token: string): Promise<SiteListEntry> {
  const response = await fetch(`/api/sites/${encodeURIComponent(id)}/token`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to rotate the token'));
  }
  return (await response.json()) as SiteListEntry;
}

export async function deleteSite(id: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to delete the website'));
  }
}

// The server keys this route's own rate limit by site, not by caller
// (routes/sites.ts) - several admins reindexing the same site in a
// burst share one cooldown, so a 429 here is an expected, everyday
// outcome, not a fault. Read the standard Retry-After response header
// (seconds) for a friendly wait-time message rather than falling
// through to the generic parseErrorMessage fallback, which has nothing
// useful to say about a body @fastify/rate-limit generates itself.
export async function reindexSite(id: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(id)}/search/rebuild`, { method: 'POST' });
  if (response.status === 429) {
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? `${retryAfterSeconds}s` : 'a moment';
    throw new Error(`Search was reindexed recently - try again in ${wait}.`);
  }
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to reindex search'));
  }
}
