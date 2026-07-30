import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export interface ThemeSchemas {
  sections: Record<string, object>;
  blocks: Record<string, object>;
  acceptsBlocks: { sections: Record<string, boolean>; blocks: Record<string, boolean> };
}

export type SiteThemeSchemasResult =
  | { outcome: 'ok'; schemas: ThemeSchemas }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface FetchSiteThemeSchemasOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isPlainObjectRecord(value: unknown): value is Record<string, object> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!isPlainObjectRecord(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isThemeSchemasBody(value: unknown): value is ThemeSchemas {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const acceptsBlocks = record.acceptsBlocks as Record<string, unknown> | undefined;
  return (
    isPlainObjectRecord(record.sections) &&
    isPlainObjectRecord(record.blocks) &&
    typeof acceptsBlocks === 'object' &&
    acceptsBlocks !== null &&
    isBooleanRecord(acceptsBlocks.sections) &&
    isBooleanRecord(acceptsBlocks.blocks)
  );
}

// I2, I3, I4: the only place the admin can learn what section/block
// types the active theme supports, their settings schemas, and
// whether each type accepts nested blocks - a single read-only call,
// no site-facing query params.
export async function fetchSiteThemeSchemas(
  site: Pick<Site, 'url' | 'token'>,
  options: FetchSiteThemeSchemasOptions = {},
): Promise<SiteThemeSchemasResult> {
  const result = await fetchSite(site, '/v1/theme/schemas', { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/theme/schemas (${interpreted.status})` };
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(interpreted.body));
  } catch {
    return { outcome: 'error', message: '/v1/theme/schemas did not return valid JSON' };
  }

  if (!isThemeSchemasBody(body)) {
    return { outcome: 'error', message: '/v1/theme/schemas did not return the expected shape' };
  }

  return { outcome: 'ok', schemas: body };
}
