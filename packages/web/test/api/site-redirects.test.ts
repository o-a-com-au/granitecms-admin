import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSiteRedirect,
  deleteSiteRedirect,
  listSiteRedirects,
  updateSiteRedirect,
} from '../../src/api/site-redirects.ts';
import { SiteEditorError } from '../../src/api/site-editor.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ENTRY = { from: '/old', to: '/new', note: 'moved page' };

describe('listSiteRedirects', () => {
  it('GETs the redirects list for the site', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/sites/site-1/redirects');
      return new Response(JSON.stringify({ entries: [ENTRY] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listSiteRedirects('site-1');

    expect(result.entries).toEqual([ENTRY]);
  });

  it('throws a SiteEditorError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'boom' }), { status: 502 })),
    );

    await expect(listSiteRedirects('site-1')).rejects.toBeInstanceOf(SiteEditorError);
  });
});

describe('createSiteRedirect', () => {
  it('POSTs from/to/note/message, without an author (the server supplies it from the session)', async () => {
    let receivedBody: unknown;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ entry: ENTRY, retargeted: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createSiteRedirect('site-1', '/old', '/new', 'moved page', 'Add redirect');

    expect(result).toEqual({ entry: ENTRY, retargeted: [] });
    expect(receivedBody).toEqual({ from: '/old', to: '/new', note: 'moved page', message: 'Add redirect' });
  });

  it('400: rejects with an invalid reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'That redirect would create a cycle' }), { status: 400 })),
    );

    try {
      await createSiteRedirect('site-1', '/a', '/a', undefined, 'msg');
      expect.unreachable('expected createSiteRedirect to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('invalid');
      expect((error as SiteEditorError).message).toBe('That redirect would create a cycle');
    }
  });

  it('409: rejects with a conflict reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'A redirect from that path already exists' }), { status: 409 })),
    );

    try {
      await createSiteRedirect('site-1', '/old', '/new', undefined, 'msg');
      expect.unreachable('expected createSiteRedirect to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('conflict');
    }
  });
});

describe('updateSiteRedirect', () => {
  it('PUTs from/to/note/message', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('PUT');
      return new Response(JSON.stringify({ entry: { from: '/old', to: '/newer' }, retargeted: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await updateSiteRedirect('site-1', '/old', '/newer', undefined, 'Update redirect');

    expect(result.entry).toEqual({ from: '/old', to: '/newer' });
  });
});

describe('deleteSiteRedirect', () => {
  it('DELETEs with from/message in the body', async () => {
    let receivedBody: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/sites/site-1/redirects');
      expect(init?.method).toBe('DELETE');
      receivedBody = JSON.parse(init?.body as string);
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await deleteSiteRedirect('site-1', '/old', 'Remove redirect');

    expect(receivedBody).toEqual({ from: '/old', message: 'Remove redirect' });
  });

  it('404: rejects with a not-found reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'No redirect found at that path' }), { status: 404 })),
    );

    try {
      await deleteSiteRedirect('site-1', '/gone', 'msg');
      expect.unreachable('expected deleteSiteRedirect to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('not-found');
    }
  });
});
