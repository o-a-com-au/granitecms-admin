import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MediaKindFilter } from '../../src/media/MediaKindFilter.tsx';

afterEach(() => {
  cleanup();
});

function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Filter media by type' }));
}

describe('MediaKindFilter', () => {
  it('shows no menu until the trigger is clicked', () => {
    render(<MediaKindFilter kind="all" onChange={vi.fn()} />);

    expect(screen.queryByRole('menu')).toBeNull();
    // Positive control: the trigger itself is present, so this is not
    // passing because nothing rendered.
    expect(screen.getByRole('button', { name: 'Filter media by type' })).toBeDefined();
  });

  it('opens a menu of all three kinds, in the order requested', () => {
    render(<MediaKindFilter kind="all" onChange={vi.fn()} />);
    openMenu();

    const labels = screen.getAllByRole('menuitemradio').map((item) => item.textContent);
    expect(labels).toEqual(['Show All', 'Videos', 'Images']);
  });

  it('reports the chosen kind and closes the menu', () => {
    const onChange = vi.fn();
    render(<MediaKindFilter kind="all" onChange={onChange} />);
    openMenu();

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Videos' }));

    expect(onChange).toHaveBeenCalledWith('videos');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('marks the active kind with aria-checked', () => {
    render(<MediaKindFilter kind="images" onChange={vi.fn()} />);
    openMenu();

    expect(screen.getByRole('menuitemradio', { name: 'Images' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'Videos' }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('menuitemradio', { name: 'Show All' }).getAttribute('aria-checked')).toBe('false');
  });

  it('shows a badge naming the active filter, since a menu hides the current state', () => {
    const { container } = render(<MediaKindFilter kind="videos" onChange={vi.fn()} />);

    const badge = container.querySelector('.media-filter-badge');
    expect(badge).not.toBeNull();
    // Readable text, uppercased in CSS rather than the markup, so a
    // screen reader is not handed an all-caps word to spell out.
    expect(badge?.textContent).toBe('Videos');
  });

  it('shows no badge while showing everything, which is the whole point of it', () => {
    const { container } = render(<MediaKindFilter kind="all" onChange={vi.fn()} />);

    expect(container.querySelector('.media-filter-badge')).toBeNull();
  });

  it('reflects open state on the trigger for assistive technology', () => {
    render(<MediaKindFilter kind="all" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Filter media by type' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('dismisses on an outside click without choosing anything', () => {
    const onChange = vi.fn();
    render(<MediaKindFilter kind="all" onChange={onChange} />);
    openMenu();
    expect(screen.getByRole('menu')).toBeDefined();

    // useAddMenu listens for mousedown on the document, not click.
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
