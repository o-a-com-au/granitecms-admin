import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VideoField, coerceVideoValue, type VideoFieldValue } from '../../src/sections/VideoField.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Same shape as ImageField's own harness: VideoField calls useSites()
// on every render, so /api/sites is stubbed unconditionally rather than
// only in the picker tests, or the others hit a real unhandled fetch.
// The media list carries both a video and an image, since this field
// opens the same picker for two different targets.
function installFakeMediaApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/sites') {
        return new Response(
          JSON.stringify([{ id: 'site-1', url: 'http://site.example', createdAt: '', updatedAt: '', status: { state: 'ok', agentVersion: '', contentSchemaVersion: 1, sqliteDriver: '' } }]),
          { status: 200 },
        );
      }
      if (url === '/api/sites/site-1/media') {
        return new Response(
          JSON.stringify({
            items: [
              { name: 'clip.mp4', size: 5, mtimeMs: 1, url: 'http://site.example/media/clip.mp4' },
              { name: 'still.jpg', size: 5, mtimeMs: 2, url: 'http://site.example/media/still.jpg' },
            ],
            maxUploadBytes: 1000,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unhandled fetch in test: ${url}`);
    }),
  );
}

// Deliberately NOT wrapped in a <label>, unlike ImageField's own test:
// this is a compound field, so SchemaField renders it inside a plain
// <div> and passes labelledBy instead. Wrapping it here would be
// testing a shape the app never renders, and the poster note's text
// would be folded into the accessible name.
function renderField(value: unknown, onChange = vi.fn()) {
  const result = render(
    <VideoField siteId="site-1" value={value} onChange={onChange} labelledBy="field-label" />,
  );
  return { onChange, container: result.container };
}

const WITH_VIDEO: VideoFieldValue = { url: 'https://example.com/a.mp4', poster: '' };

describe('VideoField', () => {
  beforeEach(() => {
    installFakeMediaApi();
  });

  it('renders a text input bound to the current url', () => {
    renderField({ url: 'https://example.com/a.mp4', poster: '' });

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('https://example.com/a.mp4');
  });

  it('associates the url input with the label SchemaField gave it', () => {
    renderField(WITH_VIDEO);

    // The whole reason this field is compound: it carries an
    // explanatory note, and a wrapping <label> would fold that text
    // into the input's accessible name instead of naming the field.
    expect(screen.getByRole('textbox').getAttribute('aria-labelledby')).toBe('field-label');
  });

  it('shows no preview at all while the url is empty', () => {
    const { container } = renderField(undefined);

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect(container.querySelector('video')).toBeNull();
  });

  it('renders the clip and its poster once both are set', async () => {
    const { container } = renderField({ url: 'https://example.com/a.mp4', poster: '/media/still.jpg' });

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('https://example.com/a.mp4');
    // The poster is stored site-relative, so it only becomes a usable
    // src once useSites() has resolved the site's real origin.
    await waitFor(() => {
      expect(container.querySelector('video')?.getAttribute('poster')).toBe('http://site.example/media/still.jpg');
    });
  });

  it('never autoplays, and keeps the clip muted and looping', () => {
    const { container } = renderField(WITH_VIDEO);

    const video = container.querySelector('video') as HTMLVideoElement;
    // An admin panel that starts playing by itself is hostile, and an
    // autoplaying element cannot respect prefers-reduced-motion.
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.hasAttribute('loop')).toBe(true);
  });

  it('Choose Video opens the picker, saying it is choosing a video', async () => {
    renderField(undefined);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Video' }));

    expect(screen.getByRole('dialog', { name: 'Choose a video' })).toBeDefined();
    await waitFor(() => expect(screen.getByText('clip.mp4')).toBeDefined());
  });

  it('selecting a clip stores it site-relative and leaves the poster alone', async () => {
    const { onChange } = renderField({ url: '', poster: '/media/keep.jpg' });

    fireEvent.click(screen.getByRole('button', { name: 'Choose Video' }));
    await waitFor(() => expect(screen.getByText('clip.mp4')).toBeDefined());
    fireEvent.click(screen.getByAltText('clip.mp4'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    // The picker hands back an absolute url; stored content keeps the
    // bare path so it survives the site being served from elsewhere.
    expect(onChange).toHaveBeenCalledWith({ url: '/media/clip.mp4', poster: '/media/keep.jpg' });
  });

  it('Choose Poster opens the same picker for a different target, and stores only the poster', async () => {
    const { onChange } = renderField(WITH_VIDEO);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Poster' }));
    expect(screen.getByRole('dialog', { name: 'Choose a poster image' })).toBeDefined();
    await waitFor(() => expect(screen.getByText('still.jpg')).toBeDefined());
    fireEvent.click(screen.getByAltText('still.jpg'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(onChange).toHaveBeenCalledWith({ url: 'https://example.com/a.mp4', poster: '/media/still.jpg' });
  });

  it('offers no poster controls until there is a clip to put one behind', () => {
    renderField(undefined);

    expect(screen.queryByRole('button', { name: 'Choose Poster' })).toBeNull();
    // Positive control: the video button is present, so this is not
    // passing simply because nothing rendered at all.
    expect(screen.getByRole('button', { name: 'Choose Video' })).toBeDefined();
  });

  it('relabels the button and offers Remove once a clip is set', () => {
    renderField(WITH_VIDEO);

    expect(screen.getByRole('button', { name: 'Change Video' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Choose Video' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDefined();
  });

  it('Remove clears the poster along with the clip', () => {
    const { onChange } = renderField({ url: 'https://example.com/a.mp4', poster: '/media/still.jpg' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    // A poster left behind would show as the still for whatever clip
    // replaced it.
    expect(onChange).toHaveBeenCalledWith({ url: '', poster: '' });
  });

  it('Clear removes the poster but keeps the clip', () => {
    const { onChange } = renderField({ url: 'https://example.com/a.mp4', poster: '/media/still.jpg' });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledWith({ url: 'https://example.com/a.mp4', poster: '' });
  });

  it('shows a fallback rather than a collapsed box when the clip will not load', () => {
    const { container } = renderField(WITH_VIDEO);

    fireEvent.error(container.querySelector('video') as HTMLVideoElement);

    expect(screen.getByText('Video failed to load')).toBeDefined();
  });

  it('typing a url preserves the existing poster', () => {
    const { onChange } = renderField({ url: '', poster: '/media/still.jpg' });

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'https://example.com/b.webm' } });

    expect(onChange).toHaveBeenCalledWith({ url: 'https://example.com/b.webm', poster: '/media/still.jpg' });
  });
});

describe('coerceVideoValue', () => {
  it('falls back to empty strings so the input never flips to uncontrolled', () => {
    // Content authored before this field existed, or by another tool.
    expect(coerceVideoValue(undefined)).toEqual({ url: '', poster: '' });
    expect(coerceVideoValue(null)).toEqual({ url: '', poster: '' });
    expect(coerceVideoValue('a string')).toEqual({ url: '', poster: '' });
    expect(coerceVideoValue({ url: 42, poster: [] })).toEqual({ url: '', poster: '' });
  });

  it('keeps the values it recognises', () => {
    expect(coerceVideoValue({ url: '/media/a.mp4', poster: '/media/b.jpg' })).toEqual({
      url: '/media/a.mp4',
      poster: '/media/b.jpg',
    });
  });
});
