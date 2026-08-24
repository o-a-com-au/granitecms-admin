import { reasonFromResponse } from './site-editor.ts';

export interface PageTemplate {
  id: string;
  title: string;
  content: unknown;
}

// Group Q: what the New Page modal's template picker is built from -
// fetched once when that modal opens, not per-field. Mirrors
// fetchSiteThemeSchemas exactly.
export async function fetchSitePageTemplates(siteId: string): Promise<PageTemplate[]> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/theme/page-templates`);

  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  const body = (await response.json()) as { templates: PageTemplate[] };
  return body.templates;
}
