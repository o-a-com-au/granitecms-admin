import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteSitePage } from '../../src/api/site-content.ts';
import { SiteEditorError } from '../../src/api/site-editor.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('deleteSitePage', () => {
  it('DELETEs /api/sites/:id/content/<path> with message in the body', async () => {
    let receivedMethod: string | undefined;
    let receivedBody: unknown;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/sites/site-1/content/pages/about.json');
      receivedMethod = init?.method;
      receivedBody = JSON.parse(init?.body as string);
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await deleteSitePage('site-1', 'pages/about.json', 'Delete About');

    expect(receivedMethod).toBe('DELETE');
    expect(receivedBody).toEqual({ message: 'Delete About' });
  });

  it('404: rejects with a not-found reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'No page found at that path' }), { status: 404 })),
    );

    try {
      await deleteSitePage('site-1', 'pages/gone.json', 'msg');
      expect.unreachable('expected deleteSitePage to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('not-found');
    }
  });

  it('409 (has children): rejects with a conflict reason, carrying the agent\'s own message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: '"pages/about.json" has child pages; delete them first' }), { status: 409 }),
      ),
    );

    try {
      await deleteSitePage('site-1', 'pages/about.json', 'msg');
      expect.unreachable('expected deleteSitePage to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SiteEditorError);
      expect((error as SiteEditorError).reason).toBe('conflict');
      expect((error as SiteEditorError).message).toBe('"pages/about.json" has child pages; delete them first');
    }
  });
});
