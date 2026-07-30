import { reasonFromResponse } from './site-editor.ts';

export interface ThemeSchemas {
  sections: Record<string, object>;
  blocks: Record<string, object>;
  acceptsBlocks: { sections: Record<string, boolean>; blocks: Record<string, boolean> };
}

// I2, I3, I4: what the schema-driven section/block editor is built
// from - fetched once per editor session, not per field.
export async function fetchSiteThemeSchemas(siteId: string): Promise<ThemeSchemas> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/theme/schemas`);

  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }
  return (await response.json()) as ThemeSchemas;
}
