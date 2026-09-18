import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mediaKindFromAttribute, replaceInstanceMedia } from '../../src/media/replace-instance-media.ts';
import { SiteEditorError } from '../../src/api/site-editor.ts';
import { createFakeStorage } from '../helpers/fakeStorage.ts';

// The save behind "drag a media file onto the preview". Untested until
// now, and the riskiest part of that feature: an image setting and a
// video setting store genuinely different shapes ({ url, focalX, focalY }
// vs { url, poster }), so writing the wrong one does not look wrong - it
// either fails the agent's own schema validation on save, or quietly
// discards a poster somebody chose. Nothing in the UI would say why.

const EDITOR_LOCATION_KEY = 'cms-admin-last-editor-location';

function page(sections: unknown[]): string {
  return JSON.stringify({
    schemaVersion: 6,
    name: 'Home',
    title: 'Home',
    type: 'page',
    layout: 'theme',
    published: true,
    sections,
  });
}

interface Captured {
  savedBody: unknown;
  savedPath: string | undefined;
  ifMatch: string | null | undefined;
}

function installFakeEditorApi(content: string): Captured {
  const captured: Captured = { savedBody: undefined, savedPath: undefined, ifMatch: undefined };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.includes('/content/')) {
        // readSiteEditorContent rejects a response missing either header.
        return new Response(content, {
          status: 200,
          headers: { etag: 'W/"etag-1"', 'x-content-source': 'live' },
        });
      }
      if (url.includes('/drafts/')) {
        captured.savedPath = url;
        captured.ifMatch = new Headers(init?.headers).get('If-Match');
        captured.savedBody = JSON.parse(String(init?.body));
        return new Response(null, { status: 204, headers: { etag: 'W/"etag-2"' } });
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
  return captured;
}

function savedSettings(captured: Captured, index = 0): Record<string, unknown> {
  const body = captured.savedBody as { sections: { settings: Record<string, unknown> }[] };
  return body.sections[index]!.settings;
}

beforeEach(() => {
  // Real localStorage is inert in this environment - Node's own
  // experimental global shadows jsdom's without a CLI flag this project
  // does not pass, so it is undefined rather than empty. Every test
  // exercising a "something was remembered" branch has to stub it (see
  // test/helpers/fakeStorage.ts).
  vi.stubGlobal('localStorage', createFakeStorage());
  // replaceInstanceMedia resolves which page to write from the editor
  // location the preview last recorded - the content path rides on it as
  // a query param, percent-encoded exactly as the app itself writes it.
  localStorage.setItem(
    EDITOR_LOCATION_KEY,
    JSON.stringify({ 'site-1': '/sites/site-1/editor?path=pages%2Findex.json&url=%2F' }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('replaceInstanceMedia', () => {
  it('swaps an image url while keeping the focal point somebody set', async () => {
    const captured = installFakeEditorApi(
      page([{ id: 'sec-1', type: 'hero', settings: { image: { url: '/media/old.jpg', focalX: 0.2, focalY: 0.8 }, heading: 'Hi' } }]),
    );

    await replaceInstanceMedia('site-1', 'sec-1', 'image', '/media/new.jpg', 'image');

    expect(savedSettings(captured).image).toEqual({ url: '/media/new.jpg', focalX: 0.2, focalY: 0.8 });
    // Swapping the picture must not wipe the rest of the section.
    expect(savedSettings(captured).heading).toBe('Hi');
  });

  it('swaps a video url while keeping the poster', async () => {
    const captured = installFakeEditorApi(
      page([{ id: 'sec-1', type: 'cta-banner', settings: { backgroundLoop: { url: '/media/old.mp4', poster: '/media/still.jpg' } } }]),
    );

    await replaceInstanceMedia('site-1', 'sec-1', 'backgroundLoop', '/media/new.mp4', 'video');

    expect(savedSettings(captured).backgroundLoop).toEqual({ url: '/media/new.mp4', poster: '/media/still.jpg' });
  });

  it('never writes an image shape onto a video field', async () => {
    const captured = installFakeEditorApi(
      page([{ id: 'sec-1', type: 'cta-banner', settings: { backgroundLoop: { url: '/media/old.mp4', poster: '/media/still.jpg' } } }]),
    );

    await replaceInstanceMedia('site-1', 'sec-1', 'backgroundLoop', '/media/new.mp4', 'video');

    // focalX/focalY on a { url, poster } field fail the agent's own
    // schema validation, so this is a save that would simply be rejected.
    const written = savedSettings(captured).backgroundLoop as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['poster', 'url']);
  });

  it('fills in the defaults when the field has never been set', async () => {
    const captured = installFakeEditorApi(page([{ id: 'sec-1', type: 'hero', settings: {} }]));

    await replaceInstanceMedia('site-1', 'sec-1', 'image', '/media/new.jpg', 'image');

    // A centred focal point rather than undefined, so the value is
    // immediately valid against a format: "image" schema.
    expect(savedSettings(captured).image).toEqual({ url: '/media/new.jpg', focalX: 0.5, focalY: 0.5 });
  });

  it('reaches a block nested inside a section, not just a top-level section', async () => {
    const captured = installFakeEditorApi(
      page([
        {
          id: 'sec-1',
          type: 'people',
          settings: {},
          blocks: [{ id: 'blk-1', type: 'person', settings: { portrait: { url: '/media/old.jpg', focalX: 0.5, focalY: 0.5 } } }],
        },
      ]),
    );

    await replaceInstanceMedia('site-1', 'blk-1', 'portrait', '/media/new.jpg', 'image');

    const body = captured.savedBody as { sections: { blocks: { settings: Record<string, unknown> }[] }[] };
    expect(body.sections[0]!.blocks[0]!.settings.portrait).toEqual({ url: '/media/new.jpg', focalX: 0.5, focalY: 0.5 });
  });

  it('sends the etag it read back as If-Match, so a concurrent edit cannot be clobbered', async () => {
    const captured = installFakeEditorApi(
      page([{ id: 'sec-1', type: 'hero', settings: { image: { url: '/media/old.jpg', focalX: 0.5, focalY: 0.5 } } }]),
    );

    await replaceInstanceMedia('site-1', 'sec-1', 'image', '/media/new.jpg', 'image');

    expect(captured.ifMatch).toBe('W/"etag-1"');
    expect(captured.savedPath).toContain('/drafts/pages/index.json');
  });

  it('refuses rather than guessing when no page is open in the preview', async () => {
    // A fresh empty store, replacing the seeded one from beforeEach.
    vi.stubGlobal('localStorage', createFakeStorage());
    installFakeEditorApi(page([{ id: 'sec-1', type: 'hero', settings: {} }]));

    await expect(replaceInstanceMedia('site-1', 'sec-1', 'image', '/media/new.jpg', 'image')).rejects.toThrow(
      SiteEditorError,
    );
  });

  it('refuses when the dropped-on instance is no longer on the page', async () => {
    installFakeEditorApi(page([{ id: 'sec-1', type: 'hero', settings: {} }]));

    // The preview can be showing a stale render of a section that has
    // since been deleted in another tab.
    await expect(replaceInstanceMedia('site-1', 'gone', 'image', '/media/new.jpg', 'image')).rejects.toThrow(
      SiteEditorError,
    );
  });
});

describe('mediaKindFromAttribute', () => {
  it('treats only an explicit "video" as a video', () => {
    expect(mediaKindFromAttribute('video')).toBe('video');
    expect(mediaKindFromAttribute('image')).toBe('image');
  });

  it('treats an absent kind as an image, which is what the older contract meant', () => {
    // data-cms-image marks images and carries no kind at all, and a drag
    // payload from a build predating video carries none either. Reading
    // the absent case as anything but "image" would refuse every drop
    // onto a theme written before responsive-media existed.
    expect(mediaKindFromAttribute(undefined)).toBe('image');
    expect(mediaKindFromAttribute(null)).toBe('image');
    expect(mediaKindFromAttribute('')).toBe('image');
  });

  it('does not treat a near-miss as a video', () => {
    // A mismatch is refused rather than coerced, so a value that is not
    // exactly "video" must resolve to image and be refused loudly -
    // never silently write { url, focalX, focalY } over { url, poster }.
    expect(mediaKindFromAttribute('videos')).toBe('image');
    expect(mediaKindFromAttribute('Video')).toBe('image');
    expect(mediaKindFromAttribute('movie')).toBe('image');
  });
});
