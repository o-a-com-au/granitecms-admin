import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { internalPath, LinkInput } from '../../src/sections/LinkInput.tsx';
import { clearSitePagesCache } from '../../src/sections/useSitePages.ts';

const ENTRIES = [
  { path: 'pages/index.json', name: 'Home', title: 'Home', type: 'page', published: true, hasDraft: false, url: '/', changedAt: null },
  { path: 'pages/about.json', name: 'About', title: 'About us', type: 'page', published: true, hasDraft: false, url: '/about', changedAt: null },
  { path: 'pages/tasting.json', name: 'Tasting', title: 'Tasting notes', type: 'page', published: false, hasDraft: true, url: '/tasting-notes', changedAt: null },
];

function Harness({ initial = '', onEnter }: { initial?: string; onEnter?: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id="label">Link</span>
      <LinkInput siteId="site-1" value={value} onChange={setValue} labelledBy="label" onEnter={onEnter} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const input = () => screen.getByRole('combobox', { name: 'Link' }) as HTMLInputElement;
const optionTitles = () => screen.queryAllByRole('option').map((option) => option.querySelector('.link-input-option-title')?.firstChild?.textContent);

beforeEach(() => {
  clearSitePagesCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      if (url.toString().startsWith('/api/sites/site-1/content')) {
        return new Response(JSON.stringify(ENTRIES), { status: 200 });
      }
      throw new Error(`unhandled fetch: ${url.toString()}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('LinkInput', () => {
  it('suggests pages by title or path as you type, with drafts marked', async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: 'tast' } });
    await waitFor(() => expect(optionTitles()).toEqual(['Tasting notes']));
    expect(screen.getByRole('option').textContent).toContain('Draft');
    expect(screen.getByRole('option').textContent).toContain('/tasting-notes');

    fireEvent.change(input(), { target: { value: '/ab' } });
    await waitFor(() => expect(optionTitles()).toEqual(['About us']));
  });

  it('choosing a page stores its path, keeping a #fragment already typed', async () => {
    render(<Harness initial="/old#team" />);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    await waitFor(() => expect(optionTitles()).toHaveLength(3));
    fireEvent.mouseDown(screen.getAllByRole('option')[1] as HTMLElement);
    expect(screen.getByTestId('value').textContent).toBe('/about#team');
  });

  it('an external address, mailto:, tel: or #anchor is typed freely, with no page suggestions', async () => {
    render(<Harness />);
    for (const typed of ['https://example.com', 'mailto:hi@example.com', 'tel:0400', '#top']) {
      fireEvent.change(input(), { target: { value: typed } });
      expect(screen.getByTestId('value').textContent).toBe(typed);
      await waitFor(() => expect(screen.queryAllByRole('option')).toHaveLength(0));
    }
  });

  it('says which page a site path reaches, or that none is there', async () => {
    const { unmount } = render(<Harness initial="/about/" />);
    expect(await screen.findByText('Links to About us')).toBeDefined();
    unmount();
    render(<Harness initial="/gone?x=1" />);
    expect(await screen.findByText('No page at /gone')).toBeDefined();
  });

  it('keyboard: arrows move through suggestions, Enter picks one, Enter with none picked goes to onEnter', async () => {
    const onEnter = vi.fn();
    render(<Harness onEnter={onEnter} />);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    await waitFor(() => expect(optionTitles()).toHaveLength(3));
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.getByTestId('value').textContent).toBe('/');
    expect(onEnter).not.toHaveBeenCalled();

    fireEvent.change(input(), { target: { value: 'https://example.com' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('internalPath: site paths only, without query, fragment or trailing slash', () => {
    expect(internalPath('/about/')).toBe('/about');
    expect(internalPath('/about?a=1#b')).toBe('/about');
    expect(internalPath('/')).toBe('/');
    expect(internalPath('https://example.com/about')).toBeNull();
    expect(internalPath('//cdn.example.com/x')).toBeNull();
    expect(internalPath('/media/photo.jpg')).toBeNull();
    expect(internalPath('#top')).toBeNull();
  });
});
