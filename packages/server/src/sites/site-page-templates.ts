import type { Site } from './site.ts';
import { fetchSite } from './fetch-site.ts';
import { interpretSiteResponse } from './interpret-site-response.ts';

export interface PageTemplate {
  id: string;
  title: string;
  // The template's own full page content, exactly as the agent's own
  // page.schema.json validated it - opaque here, since this proxy
  // never needs to look inside it (the admin creates a page from a
  // template by sending this content straight back as a draft body,
  // see api/site-page-templates.ts on the web side).
  content: unknown;
}

export type SitePageTemplatesResult =
  | { outcome: 'ok'; templates: PageTemplate[] }
  | { outcome: 'unreachable'; message: string }
  | { outcome: 'unauthorized'; message: string }
  | { outcome: 'error'; message: string };

export interface FetchSitePageTemplatesOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isPageTemplate(value: unknown): value is PageTemplate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.title === 'string' && 'content' in record;
}

function isPageTemplatesBody(value: unknown): value is { templates: PageTemplate[] } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.templates) && record.templates.every(isPageTemplate);
}

// Group Q: what the admin's New Page picker is built from - fetched
// once when that modal opens, not per-field. Mirrors
// fetchSiteThemeSchemas exactly (same fetchSite/interpretSiteResponse
// call, same outcome union, same shape-validated JSON parse).
export async function fetchSitePageTemplates(
  site: Pick<Site, 'url' | 'token'>,
  options: FetchSitePageTemplatesOptions = {},
): Promise<SitePageTemplatesResult> {
  const result = await fetchSite(site, '/v1/theme/page-templates', { ...options, authToken: site.token });
  const interpreted = await interpretSiteResponse(result);

  if (interpreted.outcome === 'unreachable') {
    return { outcome: 'unreachable', message: 'Could not reach the site' };
  }
  if (interpreted.outcome === 'unauthorized') {
    return { outcome: 'unauthorized', message: 'The stored token was rejected' };
  }
  if (interpreted.status !== 200) {
    return { outcome: 'error', message: `Unexpected response from /v1/theme/page-templates (${interpreted.status})` };
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(interpreted.body));
  } catch {
    return { outcome: 'error', message: '/v1/theme/page-templates did not return valid JSON' };
  }

  if (!isPageTemplatesBody(body)) {
    return { outcome: 'error', message: '/v1/theme/page-templates did not return the expected shape' };
  }

  return { outcome: 'ok', templates: body.templates };
}
