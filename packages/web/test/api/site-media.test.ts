import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteSiteMedia, listSiteMedia, uploadSiteMedia } from '../../src/api/site-media.ts';
import { SiteEditorError } from '../../src/api/site-editor.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listSiteMedia', () => {
  it('GETs the media list for the site', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/sites/site-1/media');
      return new Response(
        JSON.stringify({ items: [{ name: 'a.jpg', size: 5, mtimeMs: 1, url: 'http://x/media/a.jpg' }], maxUploadBytes: 999 }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await listSiteMedia('site-1');

    expect(result.maxUploadBytes).toBe(999);
    expect(result.items).toHaveLength(1);
  });

  it('throws a SiteEditorError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'boom' }), { status: 502 })),
    );

    await expect(listSiteMedia('site-1')).rejects.toBeInstanceOf(SiteEditorError);
  });
});

describe('uploadSiteMedia', () => {
  it('POSTs the file as multipart form data with no manual Content-Type', async () => {
    let receivedBody: FormData | undefined;
    let receivedHeaders: HeadersInit | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      receivedBody = init?.body as FormData;
      receivedHeaders = init?.headers;
      return new Response(JSON.stringify({ name: 'a.jpg', size: 5, url: 'http://x/media/a.jpg' }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['hello'], 'a.jpg', { type: 'image/jpeg' });
    const result = await uploadSiteMedia('site-1', file);

    expect(result).toEqual({ name: 'a.jpg', size: 5, url: 'http://x/media/a.jpg' });
    expect(receivedBody).toBeInstanceOf(FormData);
    expect(receivedHeaders).toBeUndefined();
  });

  it('415: rejects with an unsupported-type reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'bad type' }), { status: 415 })),
    );

    const file = new File(['x'], 'icon.svg', { type: 'image/svg+xml' });
    try {
      await uploadSiteMedia('site-1', file);
      expect.unreachable('expected uploadSiteMedia to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as InstanceType<typeof SiteEditorError>).reason).toBe('unsupported-type');
    }
  });

  it('413: rejects with a too-large reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'too big' }), { status: 413 })),
    );

    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    try {
      await uploadSiteMedia('site-1', file);
      expect.unreachable('expected uploadSiteMedia to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as InstanceType<typeof SiteEditorError>).reason).toBe('too-large');
    }
  });
});

describe('deleteSiteMedia', () => {
  it('DELETEs the named file', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/sites/site-1/media/a.jpg');
      expect(init?.method).toBe('DELETE');
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await deleteSiteMedia('site-1', 'a.jpg');
  });

  it('404: rejects with a not-found reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'missing' }), { status: 404 })),
    );

    try {
      await deleteSiteMedia('site-1', 'a.jpg');
      expect.unreachable('expected deleteSiteMedia to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as InstanceType<typeof SiteEditorError>).reason).toBe('not-found');
    }
  });
});
