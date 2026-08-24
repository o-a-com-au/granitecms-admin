import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSitePageTemplates } from '../../src/api/site-page-templates.ts';
import { SiteEditorError } from '../../src/api/site-editor.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const TEMPLATE = {
  id: 'blog-article',
  title: 'Blog Article',
  content: { schemaVersion: 5, name: 'blog-article', title: 'Blog Article', type: 'page', layout: 'theme', published: true, sections: [] },
};

describe('fetchSitePageTemplates', () => {
  it('Group Q: GETs the page templates list for the site', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/sites/site-1/theme/page-templates');
      return new Response(JSON.stringify({ templates: [TEMPLATE] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchSitePageTemplates('site-1');

    expect(result).toEqual([TEMPLATE]);
  });

  it('throws a SiteEditorError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'boom' }), { status: 502 })),
    );

    await expect(fetchSitePageTemplates('site-1')).rejects.toBeInstanceOf(SiteEditorError);
  });
});
