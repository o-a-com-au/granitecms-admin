export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  email: string;
}

// Same-origin only (Vite proxies /api in dev, one Fastify process
// serves both in prod) - the browser attaches the session cookie to
// a same-origin fetch automatically. Never add credentials: 'omit'
// to any of these calls; it would silently break every authenticated
// request.
export async function login(username: string, password: string): Promise<CurrentUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error('Invalid username or password');
  }

  return (await response.json()) as CurrentUser;
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<CurrentUser | null> {
  const response = await fetch('/api/auth/me');

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error('Failed to load the current user');
  }

  return (await response.json()) as CurrentUser;
}
