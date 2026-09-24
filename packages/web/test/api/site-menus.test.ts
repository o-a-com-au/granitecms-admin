import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSiteMenu,
  fetchMenuThemeReferences,
  listSiteMenus,
  renameSiteMenuHandle,
  saveSiteMenuItems,
} from '../../src/api/site-menus.ts';
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
      {
        path: 'menus/main.json',
        name: null,
        source: 'live',
        envelope: { schemaVersion: 1, items: [{ label: 'Home', url: '/' }] },
        items: [{ label: 'Home', url: '/' }],
        etag: '"abc"',
      },
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

    expect(result).toEqual([{ path: 'menus/main.json', name: null, source: 'live', envelope: {}, items: [], etag: '"abc"' }]);
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

  it('reads a menu\'s own display name and where it was read from', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/sites/site-1/content') {
        return new Response(JSON.stringify([MENU_ENTRY]), { status: 200 });
      }
      return new Response(JSON.stringify({ schemaVersion: 7, name: 'Header', items: [] }), {
        status: 200,
        headers: { etag: '"abc"', 'x-content-source': 'draft' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [menu] = await listSiteMenus('site-1');

    expect(menu?.name).toBe('Header');
    expect(menu?.source).toBe('draft');
  });
});

describe('deleteSiteMenu', () => {
  function installDeleteFetch(liveStatus: number) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${input.toString()}`);
        if (input.toString().includes('/drafts/')) {
          return new Response(null, { status: 204 });
        }
        return new Response(liveStatus === 204 ? null : JSON.stringify({ message: 'nope' }), { status: liveStatus });
      }),
    );
    return calls;
  }

  it('a live menu is deleted through DELETE /content/*, without touching drafts', async () => {
    const calls = installDeleteFetch(204);

    await deleteSiteMenu('site-1', { path: 'menus/main.json', source: 'live' }, 'Delete menu Main');

    expect(calls).toEqual(['DELETE /api/sites/site-1/content/menus/main.json']);
  });

  it('a draft-only menu has its draft discarded, and the missing live file is not an error', async () => {
    const calls = installDeleteFetch(404);

    await deleteSiteMenu('site-1', { path: 'menus/main.json', source: 'draft' }, 'Delete menu Main');

    expect(calls).toEqual(['DELETE /api/sites/site-1/drafts/menus/main.json', 'DELETE /api/sites/site-1/content/menus/main.json']);
  });

  it('any other failure deleting the live file still throws', async () => {
    installDeleteFetch(500);

    await expect(deleteSiteMenu('site-1', { path: 'menus/main.json', source: 'live' }, 'Delete menu Main')).rejects.toBeInstanceOf(
      SiteEditorError,
    );
  });
});

describe('renameSiteMenuHandle', () => {
  it('POSTs handles with If-Match and returns the etag and stale theme references', async () => {
    let received: { url: string; ifMatch: string | undefined; body: unknown } | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        received = {
          url: input.toString(),
          ifMatch: (init?.headers as Record<string, string>)['If-Match'],
          body: JSON.parse(init?.body as string),
        };
        return new Response(JSON.stringify({ ok: true, staleThemeReferences: ['theme/layouts/theme.liquid'] }), {
          status: 200,
          headers: { etag: '"e1"' },
        });
      }),
    );

    const result = await renameSiteMenuHandle('site-1', 'main', 'header', '"e1"', 'Change handle');

    expect(result).toEqual({ etag: '"e1"', staleThemeReferences: ['theme/layouts/theme.liquid'] });
    expect(received).toEqual({
      url: '/api/sites/site-1/menus/rename',
      ifMatch: '"e1"',
      body: { from: 'main', to: 'header', message: 'Change handle' },
    });
  });

  it('a taken handle is a conflict, with the site\'s own message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'A menu with the handle "footer" already exists' }), { status: 409 })));

    await expect(renameSiteMenuHandle('site-1', 'main', 'footer', '"e1"', 'm')).rejects.toMatchObject({
      reason: 'conflict',
      message: 'A menu with the handle "footer" already exists',
    });
  });
});

describe('fetchMenuThemeReferences', () => {
  it('returns the theme files, or null when the site cannot say', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ themeFiles: ['theme/a.liquid'] }), { status: 200 })));
    expect(await fetchMenuThemeReferences('site-1', 'main')).toEqual(['theme/a.liquid']);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'x' }), { status: 502 })));
    expect(await fetchMenuThemeReferences('site-1', 'main')).toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    expect(await fetchMenuThemeReferences('site-1', 'main')).toBeNull();
  });
});
