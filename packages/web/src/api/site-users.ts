export interface SiteClient {
  id: string;
  username: string;
  name: string;
  email: string;
  grantedAt: string;
}

// The invite response only ever has a password when a brand new
// client account was created - granting an existing client access to
// another site never returns one (their existing credentials are left
// untouched), matching the server route's own branching.
export type SiteClientInviteResult = SiteClient & { password?: string };

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

export async function listSiteClients(siteId: string): Promise<SiteClient[]> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/users`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load clients'));
  }
  const body = (await response.json()) as { clients: SiteClient[] };
  return body.clients;
}

export async function inviteSiteClient(
  siteId: string,
  input: { name: string; email: string; password?: string },
): Promise<SiteClientInviteResult> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to invite the client'));
  }
  return (await response.json()) as SiteClientInviteResult;
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
