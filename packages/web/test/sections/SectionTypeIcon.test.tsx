import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SectionTypeIcon, SECTION_ICON_NAMES } from '../../src/sections/SectionTypeIcon.tsx';

function shapeCount(container: HTMLElement): number {
  return container.querySelectorAll('path, rect, circle, line, polyline, polygon').length;
}

describe('SectionTypeIcon', () => {
  it('renders a real shape for every icon name it claims to support', () => {
    expect(SECTION_ICON_NAMES.length).toBeGreaterThan(0);
    for (const name of SECTION_ICON_NAMES) {
      const { container, unmount } = render(<SectionTypeIcon name={name} />);
      expect(shapeCount(container), `icon "${name}" rendered no shapes`).toBeGreaterThan(0);
      unmount();
    }
  });

  it('falls back to a default icon when the theme names one that is not bundled', () => {
    // A theme is free to write any string, and an unrecognised one must
    // never leave the row's icon column empty - that would break the
    // alignment of every row beneath it.
    const { container } = render(<SectionTypeIcon name="not-a-real-lucide-icon" />);

    expect(shapeCount(container)).toBeGreaterThan(0);
  });

  it('falls back to a default icon when the theme declares no icon at all', () => {
    const { container } = render(<SectionTypeIcon />);

    expect(shapeCount(container)).toBeGreaterThan(0);
  });

  it('reports the icon it actually resolved to, falling back to a real bundled name', () => {
    const { container: known } = render(<SectionTypeIcon name="quote" />);
    expect(known.querySelector('svg')?.getAttribute('data-icon')).toBe('quote');

    const { container: unknown } = render(<SectionTypeIcon name="not-a-real-lucide-icon" />);
    const fallback = unknown.querySelector('svg')?.getAttribute('data-icon');
    expect(fallback).not.toBe('not-a-real-lucide-icon');
    expect(SECTION_ICON_NAMES).toContain(fallback);
  });

  it('is hidden from assistive technology - the row already has a real label', () => {
    const { container } = render(<SectionTypeIcon name="quote" />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
