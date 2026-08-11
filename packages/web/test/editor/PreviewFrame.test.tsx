import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewFrame } from '../../src/editor/PreviewFrame.tsx';

describe('PreviewFrame', () => {
  it('F1: builds the iframe src from the admin proxy route and the content url', () => {
    render(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="desktop" onDeviceChange={() => {}} />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/about?t=');
  });

  it('F1: the root url ("/") is preserved as a single slash, not stripped', () => {
    render(<PreviewFrame siteId="site-1" siteDomain={null} url="/" status="ready" device="desktop" onDeviceChange={() => {}} />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/?t=');
  });

  it('shows a fallback message and no iframe when url is null', () => {
    render(<PreviewFrame siteId="site-1" siteDomain={null} url={null} status="ready" device="desktop" onDeviceChange={() => {}} />);

    expect(screen.getByText('No live preview available for this content type.')).toBeDefined();
    expect(screen.queryByTitle('Live preview')).toBeNull();
  });

  it("F2: the src's cache-busting token changes on a real completed autosave (saving -> ready)", () => {
    const { getByTitle, rerender } = render(
      <PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="saving" device="desktop" onDeviceChange={() => {}} />,
    );
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="desktop" onDeviceChange={() => {}} />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).not.toBe(before);
  });

  it('F2: the token does not change on initial load (loading -> ready)', () => {
    const { getByTitle, rerender } = render(
      <PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="loading" device="desktop" onDeviceChange={() => {}} />,
    );
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="desktop" onDeviceChange={() => {}} />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).toBe(before);
  });

  it('F2: the token does not change when entering or leaving a conflict', () => {
    const { getByTitle, rerender } = render(
      <PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="dirty" device="desktop" onDeviceChange={() => {}} />,
    );
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="conflict" device="desktop" onDeviceChange={() => {}} />);
    rerender(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="desktop" onDeviceChange={() => {}} />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).toBe(before);
  });

  it('sizes the iframe from the device prop - desktop is 100%, with no inset/frame styling', () => {
    render(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="desktop" onDeviceChange={() => {}} />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('100%');
    expect(iframe.closest('.preview-viewport')?.getAttribute('data-device')).toBe('desktop');
  });

  it('sizes the iframe from the device prop - tablet is a fixed 768px', () => {
    render(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="tablet" onDeviceChange={() => {}} />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('768px');
    expect(iframe.closest('.preview-viewport')?.getAttribute('data-device')).toBe('tablet');
  });

  it('sizes the iframe from the device prop - mobile is a fixed 375px', () => {
    render(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="mobile" onDeviceChange={() => {}} />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('375px');
    expect(iframe.closest('.preview-viewport')?.getAttribute('data-device')).toBe('mobile');
  });

  it('shows the bare relative path when the site domain has not resolved yet', () => {
    render(<PreviewFrame siteId="site-1" siteDomain={null} url="/about" status="ready" device="desktop" onDeviceChange={() => {}} />);

    expect(screen.getByText('/about')).toBeDefined();
  });

  it('joins the site domain and the relative path into the full live address', () => {
    render(
      <PreviewFrame
        siteId="site-1"
        siteDomain="http://localhost:3891"
        url="/about"
        status="ready"
        device="desktop"
        onDeviceChange={() => {}}
      />,
    );

    expect(screen.getByText('http://localhost:3891/about')).toBeDefined();
  });

  it('does not double the slash when the stored domain already has a trailing one', () => {
    render(
      <PreviewFrame
        siteId="site-1"
        siteDomain="http://localhost:3891/"
        url="/about"
        status="ready"
        device="desktop"
        onDeviceChange={() => {}}
      />,
    );

    expect(screen.getByText('http://localhost:3891/about')).toBeDefined();
  });
});
