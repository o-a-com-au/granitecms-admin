export interface SiteInviteSummary {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
}

export interface CreateSiteInviteResult {
  emailSent: boolean;
  url: string;
  expiresAt: string;
}

export type InviteInfo =
  | { valid: true; siteUrl: string; email: string }
  | { valid: false; reason: 'expired' | 'claimed' | 'not-found' };

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    // message first: routes/site-invites.ts's error responses are
    // shaped { statusCode, error: '<generic HTTP reason phrase>',
    // message: '<the actual text>' } - error alone is just
    // "Conflict"/"Bad Request", not useful to show.
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createSiteInvite(siteId: string, email: string): Promise<CreateSiteInviteResult> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to create the invite'));
  }
  return (await response.json()) as CreateSiteInviteResult;
}

export async function listSiteInvites(siteId: string): Promise<SiteInviteSummary[]> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/invites`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load invites'));
  }
  const body = (await response.json()) as { invites: SiteInviteSummary[] };
  return body.invites;
}

export async function revokeSiteInvite(siteId: string, inviteId: string): Promise<void> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/invites/${encodeURIComponent(inviteId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to revoke the invite'));
  }
}

export async function getInvite(code: string): Promise<InviteInfo> {
  const response = await fetch(`/api/invites/${encodeURIComponent(code)}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load this invite'));
  }
  return (await response.json()) as InviteInfo;
}

// No body when the caller is already authenticated - the server reads
// that from their session, not from anything the browser sends here.
export async function claimInvite(
  code: string,
  body?: { firstName: string; lastName: string; password: string; timezone?: string },
): Promise<{ siteId: string }> {
  const response = await fetch(`/api/invites/${encodeURIComponent(code)}/claim`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to accept this invite'));
  }
  return (await response.json()) as { siteId: string };
}
