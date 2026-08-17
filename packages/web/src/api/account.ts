import type { CurrentUser } from './auth.ts';

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    // message first: routes/auth.ts's error responses are all shaped
    // { statusCode, error: '<generic HTTP reason phrase>', message:
    // '<the actual human-readable text> }' - error alone is just
    // "Conflict"/"Bad Request", not useful to show. Found live: this
    // was backwards until just now, surfacing "Conflict" instead of
    // "An account with this email already exists...".
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

// Username is never sent - it isn't editable (see AccountPage.tsx),
// only name, email, and timezone.
export async function updateAccount(input: { name: string; email: string; timezone: string }): Promise<CurrentUser> {
  const response = await fetch('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to update your account details'));
  }
  return (await response.json()) as CurrentUser;
}

export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  const response = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to change your password'));
  }
}
