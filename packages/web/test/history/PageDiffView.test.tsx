import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageDiffView } from '../../src/history/PageDiffView.tsx';

describe('PageDiffView', () => {
  it('H3: shows "No differences." when both sides are identical', () => {
    render(
      <PageDiffView fromLabel="abc123" toLabel="Current" fromContent='{"a":1}' toContent='{"a":1}' />,
    );

    expect(screen.getByText('No differences.')).toBeDefined();
  });

  it('H3: renders added, removed, and unchanged lines with the correct data-diff markers', () => {
    const { container } = render(
      <PageDiffView
        fromLabel="abc123"
        toLabel="Current"
        fromContent={'line1\nold line\nline3'}
        toContent={'line1\nnew line\nline3'}
      />,
    );

    const removed = container.querySelector('[data-diff="removed"]');
    const added = container.querySelector('[data-diff="added"]');
    const unchanged = container.querySelectorAll('[data-diff="unchanged"]');

    expect(removed?.textContent).toContain('old line');
    expect(added?.textContent).toContain('new line');
    expect(unchanged.length).toBeGreaterThan(0);
  });

  it('H3: labels the comparison with the given from/to labels', () => {
    render(<PageDiffView fromLabel="abc123" toLabel="Current" fromContent="a" toContent="b" />);

    expect(screen.getByText('abc123', { selector: 'code' })).toBeDefined();
    expect(screen.getByText('Current', { selector: 'code' })).toBeDefined();
  });
});
