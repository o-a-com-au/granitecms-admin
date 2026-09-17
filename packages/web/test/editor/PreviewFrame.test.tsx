import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PreviewFrame } from '../../src/editor/PreviewFrame.tsx';
import { describePreviewReason } from '../../src/editor/PreviewUnavailable.tsx';

describe('PreviewFrame', () => {
  it('F1: builds the iframe src from the admin proxy route and the content url', () => {
    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/about?t=');
  });

  it('F1: the root url ("/") is preserved as a single slash, not stripped', () => {
    render(<PreviewFrame siteId="site-1" url="/" status="ready" device="desktop" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/?t=');
  });

  it('builds the src from the preview-revision route when revisionRef is set', () => {
    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" revisionRef="abc123" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview-revision/abc123/about');
    expect(iframe.src).not.toContain('/preview/about');
  });

  it('reverts to the normal preview src once revisionRef is cleared', () => {
    const { rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" revisionRef="abc123" />,
    );

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" revisionRef={null} />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/about?t=');
  });

  it('shows a fallback message and no iframe when url is null', () => {
    render(<PreviewFrame siteId="site-1" url={null} status="ready" device="desktop" />);

    expect(screen.getByText('No live preview available for this content type.')).toBeDefined();
    expect(screen.queryByTitle('Live preview')).toBeNull();
  });

  it("F2: the src's cache-busting token changes on a real completed autosave (saving -> ready)", () => {
    const { getByTitle, rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="saving" device="desktop" />,
    );
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).not.toBe(before);
  });

  it('F2: the token does not change on initial load (loading -> ready)', () => {
    const { getByTitle, rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="loading" device="desktop" />,
    );
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).toBe(before);
  });

  it('refreshGeneration bumps the token independently of status - a caller with no draft/status lifecycle of its own can still force a reload', () => {
    const { getByTitle, rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="ready" refreshGeneration={0} device="desktop" />,
    );
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" refreshGeneration={1} device="desktop" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).not.toBe(before);
  });

  it('omitting refreshGeneration entirely never bumps the token on its own (defaults to a stable 0)', () => {
    const { getByTitle, rerender } = render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).toBe(before);
  });

  it('F2: the token does not change when entering or leaving a conflict', () => {
    const { getByTitle, rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="dirty" device="desktop" />,
    );
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="conflict" device="desktop" />);
    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).toBe(before);
  });

  it('sizes the iframe from the device prop - desktop is 100%, with no inset/frame styling', () => {
    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('100%');
    expect(iframe.closest('.preview-viewport')?.getAttribute('data-device')).toBe('desktop');
  });

  it('sizes the iframe from the device prop - tablet is a fixed 768px', () => {
    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="tablet" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('768px');
    expect(iframe.closest('.preview-viewport')?.getAttribute('data-device')).toBe('tablet');
  });

  it('sizes the iframe from the device prop - mobile is a fixed 375px', () => {
    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="mobile" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('375px');
    expect(iframe.closest('.preview-viewport')?.getAttribute('data-device')).toBe('mobile');
  });

  it('hides the previewed document\'s own scrollbar in tablet/mobile, not desktop - a real phone/tablet browser hides it too', () => {
    const iframeRef = createRef<HTMLIFrameElement>();
    const { rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" iframeRef={iframeRef} />,
    );
    const doc = iframeRef.current?.contentDocument as Document;
    // jsdom never actually fetches/parses an iframe's src (a well-known
    // limitation, unrelated to this feature) - its synthetic default
    // document is genuinely empty, no <html>/<head> at all, unlike any
    // real HTML response (confirmed against the actual proxy route
    // elsewhere - it injects a <base> tag into the site's own real
    // <head>). Built here purely so this test exercises the same
    // document shape production code always sees.
    if (!doc.documentElement) {
      const html = doc.createElement('html');
      html.appendChild(doc.createElement('head'));
      doc.appendChild(html);
    }
    fireEvent.load(iframeRef.current as HTMLIFrameElement);
    expect(doc.getElementById('admin-preview-hide-scrollbar')).toBeNull();

    // Switching device tiers never reloads the iframe (only resizes
    // it) - this has to take effect on the already-loaded document,
    // not wait for another load event.
    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="mobile" iframeRef={iframeRef} />);
    expect(doc.getElementById('admin-preview-hide-scrollbar')).not.toBeNull();

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="tablet" iframeRef={iframeRef} />);
    expect(doc.getElementById('admin-preview-hide-scrollbar')).not.toBeNull();

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" iframeRef={iframeRef} />);
    expect(doc.getElementById('admin-preview-hide-scrollbar')).toBeNull();
  });

  it('F2: a completed autosave preserves the previous scroll position across the reload it triggers', () => {
    const iframeRef = createRef<HTMLIFrameElement>();
    const { rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="saving" device="desktop" iframeRef={iframeRef} />,
    );

    // jsdom's window.scrollX/scrollY are plain read-only getters -
    // redefined here to stand in for "how far down the old document
    // was scrolled" at the moment the reload is triggered, below.
    const oldWin = iframeRef.current?.contentWindow as Window;
    Object.defineProperty(oldWin, 'scrollX', { value: 40, configurable: true });
    Object.defineProperty(oldWin, 'scrollY', { value: 820, configurable: true });

    // saving -> ready is what actually reloads the iframe (F2) - the
    // scroll position above must be captured in that same instant,
    // before the reload wipes it.
    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" iframeRef={iframeRef} />);

    // The reload itself: jsdom never really navigates, so the new
    // document's own load event is simulated directly, same pattern
    // PageEditorPage.test.tsx already uses for this iframe. jsdom
    // hands the iframe a fresh contentWindow the moment src changes
    // (matching a real browser navigating to a new document), so the
    // spy is set up on THAT one, not the pre-reload reference above.
    const newWin = iframeRef.current?.contentWindow as Window;
    const scrollToSpy = vi.spyOn(newWin, 'scrollTo').mockImplementation(() => {});
    fireEvent.load(iframeRef.current as HTMLIFrameElement);

    // behavior: 'instant', not a bare scrollTo(x, y) - that shorthand
    // defers to the previewed page's own CSS scroll-behavior (the demo
    // theme sets scroll-behavior: smooth site-wide), which would make
    // this restore visibly animate instead of jumping straight there.
    expect(scrollToSpy).toHaveBeenCalledWith({ left: 40, top: 820, behavior: 'instant' });
  });

  it('does not restore any scroll position on the very first load, or on switching to a different page', () => {
    const iframeRef = createRef<HTMLIFrameElement>();
    const { rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="loading" device="desktop" iframeRef={iframeRef} />,
    );
    const scrollToSpy = vi.spyOn(iframeRef.current?.contentWindow as Window, 'scrollTo').mockImplementation(() => {});

    // Initial load (loading -> ready) - never captured anything to restore.
    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" iframeRef={iframeRef} />);
    fireEvent.load(iframeRef.current as HTMLIFrameElement);
    expect(scrollToSpy).not.toHaveBeenCalled();

    // A genuine switch to a different page - same reasoning, a fresh
    // page starting at the top is correct, not a leftover position
    // from whatever page was open before.
    rerender(<PreviewFrame siteId="site-1" url="/docs" status="ready" device="desktop" iframeRef={iframeRef} />);
    fireEvent.load(iframeRef.current as HTMLIFrameElement);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('fades the iframe in on load (is-visible), not before - and again on every later load, not just the first', () => {
    const { rerender } = render(<PreviewFrame siteId="site-1" url="/about" status="loading" device="desktop" />);
    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.className).not.toContain('is-visible');

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);
    fireEvent.load(iframe);
    expect(iframe.className).toContain('is-visible');

    // A genuine switch to a different page hides it again until that
    // page's own load event - the same brief fade back in, not a
    // one-time entrance.
    rerender(<PreviewFrame siteId="site-1" url="/docs" status="ready" device="desktop" />);
    expect(iframe.className).not.toContain('is-visible');

    fireEvent.load(iframe);
    expect(iframe.className).toContain('is-visible');
  });

  // Switching between Editor/Pages/Media while staying on the same page
  // (PageEditorPage.tsx's useBlocker narrowing made this a normal,
  // unblocked path) swaps which route's handlers are registered
  // (PreviewContext.tsx's frameHandlers) without the iframe reloading
  // at all - onFrameLoad only otherwise runs from the iframe's own
  // native load event, so a fresh registration with no fresh load
  // would otherwise never actually attach the new route's own
  // click/drag listeners. Confirmed live: reported as "the viewport
  // nav stops working" after switching tools.
  it('re-invokes onFrameLoad when it changes on an already-loaded document, not just on a fresh load', () => {
    const iframeRef = createRef<HTMLIFrameElement>();
    const firstOnFrameLoad = vi.fn();
    const { rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" iframeRef={iframeRef} onFrameLoad={firstOnFrameLoad} />,
    );
    fireEvent.load(iframeRef.current as HTMLIFrameElement);
    expect(firstOnFrameLoad).toHaveBeenCalledTimes(1);
    firstOnFrameLoad.mockClear();

    // A different route's handler, same page - no src change, so no
    // native load event fires here or ever again for this page.
    const secondOnFrameLoad = vi.fn();
    rerender(
      <PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" iframeRef={iframeRef} onFrameLoad={secondOnFrameLoad} />,
    );

    expect(secondOnFrameLoad).toHaveBeenCalledTimes(1);
    expect(firstOnFrameLoad).not.toHaveBeenCalled();
  });

  it('does not re-invoke onFrameLoad on an unrelated rerender where the callback itself is unchanged', () => {
    const iframeRef = createRef<HTMLIFrameElement>();
    const onFrameLoad = vi.fn();
    const { rerender } = render(
      <PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" iframeRef={iframeRef} onFrameLoad={onFrameLoad} />,
    );
    fireEvent.load(iframeRef.current as HTMLIFrameElement);
    onFrameLoad.mockClear();

    // Same callback reference, only an unrelated prop (device) changes.
    rerender(
      <PreviewFrame siteId="site-1" url="/about" status="ready" device="tablet" iframeRef={iframeRef} onFrameLoad={onFrameLoad} />,
    );

    expect(onFrameLoad).not.toHaveBeenCalled();
  });
});

// Pointing the iframe straight at the revision route meant the browser
// rendered the route's JSON error body as plain text in the preview pane
// (reported directly, with a mockup). PreviewFrame asks first now.
describe('PreviewFrame: a revision that cannot be previewed', () => {
  // This file stubs no globals anywhere else and has no cleanup of its
  // own, so anything stubbed here has to be put back - otherwise a
  // stubbed fetch leaks into the 21 tests above.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStatus(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('renders the message and reason from the server instead of the raw JSON, and no iframe', async () => {
    stubStatus(422, {
      error: 'This revision cannot be previewed with the current theme',
      reason: 'unrenderable',
    });

    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" revisionRef="abc123" />);

    expect(await screen.findByText('This revision cannot be previewed with the current theme')).toBeDefined();
    expect(screen.getByText('Reason: Unrenderable')).toBeDefined();
    // The frame is replaced, not left showing the JSON underneath it.
    expect(screen.queryByTitle('Live preview')).toBeNull();
  });

  it('maps each reason to words rather than printing the slug', async () => {
    stubStatus(404, { error: 'No page at this path at that revision', reason: 'not-found-at-ref' });

    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" revisionRef="abc123" />);

    expect(await screen.findByText('No page at this path at that revision')).toBeDefined();
    expect(screen.getByText('Reason: This page did not exist at that revision')).toBeDefined();
    expect(screen.queryByText(/not-found-at-ref/)).toBeNull();
  });

  // The regression this very change caused once: a fetch mock that
  // simply did not know this route returned an unrecognised status, and
  // an over-broad "any non-ok" check tore down a perfectly good iframe.
  it('leaves the iframe alone on a status the proxy does not define', async () => {
    const fetchMock = stubStatus(500, { error: 'something else entirely' });

    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" revisionRef="abc123" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTitle('Live preview')).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('never pre-flights the current-version preview, only a revision', async () => {
    const fetchMock = stubStatus(422, { error: 'nope', reason: 'unrenderable' });

    render(<PreviewFrame siteId="site-1" url="/about" status="ready" device="desktop" />);

    expect(screen.getByTitle('Live preview')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('describePreviewReason', () => {
  it('gives each known reason real words', () => {
    expect(describePreviewReason('unrenderable')).toBe('Unrenderable');
    expect(describePreviewReason('not-found-at-ref')).toBe('This page did not exist at that revision');
    expect(describePreviewReason('invalid-ref')).toBe('Not a valid revision');
  });

  it('opens up an unknown slug rather than dropping it, so a new server reason still reads', () => {
    expect(describePreviewReason('some-new-reason')).toBe('Some new reason');
  });
});
