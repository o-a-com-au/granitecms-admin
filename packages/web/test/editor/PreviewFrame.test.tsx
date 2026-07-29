import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviewFrame } from '../../src/editor/PreviewFrame.tsx';

describe('PreviewFrame', () => {
  it('F1: builds the iframe src from the admin proxy route and the content url', () => {
    render(<PreviewFrame siteId="site-1" url="/about" status="ready" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/about?t=');
  });

  it('F1: the root url ("/") is preserved as a single slash, not stripped', () => {
    render(<PreviewFrame siteId="site-1" url="/" status="ready" />);

    const iframe = screen.getByTitle('Live preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/api/sites/site-1/preview/?t=');
  });

  it('shows a fallback message and no iframe when url is null', () => {
    render(<PreviewFrame siteId="site-1" url={null} status="ready" />);

    expect(screen.getByText('No live preview available for this content type.')).toBeDefined();
    expect(screen.queryByTitle('Live preview')).toBeNull();
  });

  it("F2: the src's cache-busting token changes on a real completed autosave (saving -> ready)", () => {
    const { getByTitle, rerender } = render(<PreviewFrame siteId="site-1" url="/about" status="saving" />);
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).not.toBe(before);
  });

  it('F2: the token does not change on initial load (loading -> ready)', () => {
    const { getByTitle, rerender } = render(<PreviewFrame siteId="site-1" url="/about" status="loading" />);
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).toBe(before);
  });

  it('F2: the token does not change when entering or leaving a conflict', () => {
    const { getByTitle, rerender } = render(<PreviewFrame siteId="site-1" url="/about" status="dirty" />);
    const before = (getByTitle('Live preview') as HTMLIFrameElement).src;

    rerender(<PreviewFrame siteId="site-1" url="/about" status="conflict" />);
    rerender(<PreviewFrame siteId="site-1" url="/about" status="ready" />);
    const after = (getByTitle('Live preview') as HTMLIFrameElement).src;

    expect(after).toBe(before);
  });
});
