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
    throw new Error(await parseErrorMessage(response, 'Failed to load sites'));
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
    throw new Error(await parseErrorMessage(response, 'Failed to register the site'));
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
    throw new Error(await parseErrorMessage(response, 'Failed to delete the site'));
  }
}
