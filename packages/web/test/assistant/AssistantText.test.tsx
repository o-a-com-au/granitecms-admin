import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AssistantText } from '../../src/assistant/AssistantText.tsx';

afterEach(cleanup);

describe('AssistantText', () => {
  it('shows a list of only page links as page buttons that open the page', () => {
    const openPage = vi.fn();
    const { container } = render(
      <AssistantText text={'**Named, with a bio**\n- [Home](/)\n- [Our People](/our-people)'} openPage={openPage} />,
    );
    expect(container.querySelector('.assistant-page-links')).not.toBeNull();
    expect(container.querySelector('ul')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Our People' }));
    expect(openPage).toHaveBeenCalledWith('/our-people');
    expect(screen.getByText('Named, with a bio').tagName).toBe('STRONG');
  });

  it('keeps a list with other words as a list, its page links inline', () => {
    const openPage = vi.fn();
    const { container } = render(<AssistantText text={'- [Home](/) has the hero\n- plain item'} openPage={openPage} />);
    expect(container.querySelector('ul')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(openPage).toHaveBeenCalledWith('/');
  });

  it('opens other websites in a new tab, and never links anything else', () => {
    render(<AssistantText text={'See [Lucide](https://lucide.dev), [bad](javascript:alert(1)) and [other](//evil.example).'} openPage={vi.fn()} />);
    const link = screen.getByRole('link', { name: 'Lucide' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'bad' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'other' })).toBeNull();
  });

  it('links to places in the admin', () => {
    const openAdmin = vi.fn();
    render(<AssistantText text={'Change it in [Site settings](admin:settings/announcement-bar).'} openPage={vi.fn()} openAdmin={openAdmin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Site settings' }));
    expect(openAdmin).toHaveBeenCalledWith('settings/announcement-bar');
  });
});
