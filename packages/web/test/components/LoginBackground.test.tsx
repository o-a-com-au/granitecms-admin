import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { LoginBackground } from '../../src/components/LoginBackground.tsx';

// jsdom implements no matchMedia at all, so there is nothing to spy
// on - each test installs the whole function, and the component's own
// typeof guard is what covers the "absent entirely" case the other
// page tests exercise by simply not calling this.
function stubReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginBackground', () => {
  it('renders the video and both grading overlays, the multiply pass beneath the flat one', () => {
    const { container } = render(<LoginBackground />);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.querySelector('source')?.getAttribute('src')).toBe('/background.mp4');
    expect(video?.loop).toBe(true);

    // Order matters as much as presence: the multiply pass has to sit
    // below the flat one for the grade to come out as intended, and
    // nothing else in the DOM records that.
    const tints = [...container.querySelectorAll('.login-tint')];
    expect(tints.map((tint) => tint.className)).toEqual([
      'login-tint login-tint-multiply',
      'login-tint login-tint-flat',
    ]);
  });

  it('is hidden from assistive technology - it is decoration, not content', () => {
    const { container } = render(<LoginBackground />);

    expect(container.querySelector('.login-background')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('mutes the video via the DOM property, not just the prop, so autoplay is not blocked', () => {
    stubReducedMotion(false);

    const { container } = render(<LoginBackground />);

    expect(container.querySelector('video')?.muted).toBe(true);
  });

  it('autoplays by default', () => {
    stubReducedMotion(false);

    const { container } = render(<LoginBackground />);

    expect(container.querySelector('video')?.hasAttribute('autoplay')).toBe(true);
  });

  it('never starts playback under prefers-reduced-motion, leaving the first frame showing', () => {
    stubReducedMotion(true);

    const { container } = render(<LoginBackground />);

    expect(container.querySelector('video')?.hasAttribute('autoplay')).toBe(false);
  });
});
