import type { Site } from './site.ts';

export type SiteStatus =
  | { state: 'ok'; agentVersion: string; contentSchemaVersion: number; sqliteDriver: string }
  | { state: 'unreachable'; message: string }
  | { state: 'unauthorized'; message: string }
  | { state: 'error'; message: string };

const DEFAULT_TIMEOUT_MS = 4000;

interface CapabilitiesBody {
  agentVersion: string;
  contentSchemaVersion: number;
  sqliteDriver: string;
}

function isCapabilitiesBody(value: unknown): value is CapabilitiesBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.agentVersion === 'string' &&
    typeof record.contentSchemaVersion === 'number' &&
    typeof record.sqliteDriver === 'string'
  );
}

export interface CheckSiteStatusOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

// Deliberately two sequential calls, not one - see the design note in
// docs/phase-3-checklist.md Group C: GET /v1/capabilities on a real
// cms-agent site is completely exempt from auth, so it can never
// prove a stored token is valid. Only GET /v1/content (token-scoped)
// can. Capabilities is checked first: a 401/403 from content is only
// meaningful proof of "bad token" once capabilities has already
// proven "this is really a cms-agent instance."
export async function checkSiteStatus(
  site: Pick<Site, 'url' | 'token'>,
  options: CheckSiteStatusOptions = {},
): Promise<SiteStatus> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let capabilitiesResponse: Response;
  try {
    capabilitiesResponse = await fetchImpl(new URL('/v1/capabilities', site.url), {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { state: 'unreachable', message: 'Could not reach the site' };
  }

  if (!capabilitiesResponse.ok) {
    return {
      state: 'error',
      message: `Unexpected response from /v1/capabilities (${capabilitiesResponse.status})`,
    };
  }

  let capabilitiesBody: unknown;
  try {
    capabilitiesBody = await capabilitiesResponse.json();
  } catch {
    return { state: 'error', message: '/v1/capabilities did not return valid JSON' };
  }

  if (!isCapabilitiesBody(capabilitiesBody)) {
    return { state: 'error', message: 'This does not look like a cms-agent site' };
  }

  let contentResponse: Response;
  try {
    contentResponse = await fetchImpl(new URL('/v1/content', site.url), {
      headers: { Authorization: `Bearer ${site.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { state: 'unreachable', message: 'Could not reach the site' };
  }

  // requireScope on the agent side can return 401 (missing/invalid
  // token) or 403 (valid token, wrong scope) - both are the same
  // problem from the operator's point of view.
  if (contentResponse.status === 401 || contentResponse.status === 403) {
    return { state: 'unauthorized', message: 'The stored token was rejected' };
  }

  if (!contentResponse.ok) {
    return { state: 'error', message: `Unexpected response from /v1/content (${contentResponse.status})` };
  }

  return {
    state: 'ok',
    agentVersion: capabilitiesBody.agentVersion,
    contentSchemaVersion: capabilitiesBody.contentSchemaVersion,
    sqliteDriver: capabilitiesBody.sqliteDriver,
  };
}
