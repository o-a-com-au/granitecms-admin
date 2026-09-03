import { afterEach, describe, expect, it, vi } from 'vitest';
import { listSiteMenus, saveSiteMenuItems } from '../../src/api/site-menus.ts';
import { SiteEditorError } from '../../src/api/site-editor.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAGE_ENTRY = { path: 'pages/about.json', name: 'About', title: 'About', type: 'page', published: true, hasDraft: false, url: '/about' };
const MENU_ENTRY = { path: 'menus/main.json', name: '', title: '', type: '', published: false, hasDraft: false, url: null };

describe('listSiteMenus', () => {
  it('filters the content list to menus/, then reads each one\'s own content and etag', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/sites/site-1/content') {
        return new Response(JSON.stringify([PAGE_ENTRY, MENU_ENTRY]), { status: 200 });
      }
      if (url === '/api/sites/site-1/content/menus/main.json') {
        return new Response(JSON.stringify({ schemaVersion: 1, items: [{ label: 'Home', url: '/' }] }), {
          status: 200,
          headers: { etag: '"abc"', 'x-content-source': 'live' },
        });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listSiteMenus('site-1');

    expect(result).toEqual([
      { path: 'menus/main.json', envelope: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] }, items: [{ label: 'Home', url: '/' }], etag: '"abc"' },
    ]);
  });

  it('a menu whose content is not valid JSON degrades to an empty envelope/item list rather than throwing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/sites/site-1/content') {
        return new Response(JSON.stringify([MENU_ENTRY]), { status: 200 });
      }
      return new Response('not json', { status: 200, headers: { etag: '"abc"', 'x-content-source': 'live' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listSiteMenus('site-1');

    expect(result).toEqual([{ path: 'menus/main.json', envelope: {}, items: [], etag: '"abc"' }]);
  });

  it('normalises a content-list failure to a SiteEditorError, not the SiteContentError listSiteContent itself throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'boom', reason: 'unreachable' }), { status: 502 })),
    );

    try {
      await listSiteMenus('site-1');
      expect.unreachable('expected listSiteMenus to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('unreachable');
    }
  });
});

describe('saveSiteMenuItems', () => {
  it('PUTs the envelope+items with If-Match, returning the new etag', async () => {
    let receivedBody: unknown;
    let receivedIfMatch: string | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedBody = JSON.parse(init?.body as string);
      receivedIfMatch = (init?.headers as Record<string, string>)['If-Match'];
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { etag: '"new-etag"' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const newEtag = await saveSiteMenuItems(
      'site-1',
      'menus/main.json',
      { schemaVersion: 1 },
      [{ label: 'Home', url: '/' }],
      '"old-etag"',
      'Update menu items',
    );

    expect(newEtag).toBe('"new-etag"');
    expect(receivedIfMatch).toBe('"old-etag"');
    expect(receivedBody).toEqual({
      content: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] },
      message: 'Update menu items',
    });
  });

  it('409: rejects with a conflict reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'This menu changed since you opened it' }), { status: 409 })),
    );

    try {
      await saveSiteMenuItems('site-1', 'menus/main.json', {}, [], '"stale"', 'msg');
      expect.unreachable('expected saveSiteMenuItems to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('conflict');
    }
  });

  it('404: rejects with a not-found reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'No menu found at that path' }), { status: 404 })),
    );

    try {
      await saveSiteMenuItems('site-1', 'menus/gone.json', {}, [], '"etag"', 'msg');
      expect.unreachable('expected saveSiteMenuItems to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('not-found');
    }
  });
});
