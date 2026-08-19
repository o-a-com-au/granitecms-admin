export interface SiteClient {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  grantedAt: string;
}

export interface SiteOwner {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    // message first: routes/site-users.ts's error responses are
    // shaped { statusCode, error: '<generic HTTP reason phrase>',
    // message: '<the actual text>' } - error alone is just
    // "Conflict"/"Bad Request", not useful to show.
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function listSiteClients(siteId: string): Promise<{ owner: SiteOwner | null; clients: SiteClient[] }> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/users`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load clients'));
  }
  return (await response.json()) as { owner: SiteOwner | null; clients: SiteClient[] };
}

export async function revokeSiteClient(siteId: string, userId: string): Promise<{ accountDeleted: boolean }> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to revoke access'));
  }
  return (await response.json()) as { accountDeleted: boolean };
}
