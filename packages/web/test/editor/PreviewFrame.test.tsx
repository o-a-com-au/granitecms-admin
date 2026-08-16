import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PreviewFrame } from '../../src/editor/PreviewFrame.tsx';

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
});
