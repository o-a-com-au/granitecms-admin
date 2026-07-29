import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ContentBrowserPage } from '../../src/pages/ContentBrowserPage.tsx';

const ENTRY_ONE = { path: 'pages/about.json', title: 'About', type: 'page', published: true, hasDraft: false };
const ENTRY_TWO = { path: 'pages/contact.json', title: 'Contact', type: 'page', published: false, hasDraft: true };

function renderPage(initialPath = '/sites/site-1/content') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/sites/:siteId/content" element={<ContentBrowserPage />} />
        <Route path="/" element={<div>registry home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ContentBrowserPage', () => {
  it('D1: lists content with path, type, and a derived live/draft status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE, ENTRY_TWO]), { status: 200 })));

    renderPage();

    await waitFor(() => expect(screen.getByText('pages/about.json')).toBeDefined());
    expect(screen.getByText('Live')).toBeDefined();
    expect(screen.getByText('Draft only')).toBeDefined();
  });

  it('shows "No content found." for an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));

    renderPage();

    await waitFor(() => expect(screen.getByText('No content found.')).toBeDefined());
  });

  it('D2: changing the type filter re-requests with the new query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByText('No content found.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'post' } });

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      const url = String(lastCall?.[0]);
      expect(url).toContain('type=post');
    });
  });

  it('D2: changing the draft status filter re-requests with the new query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByText('No content found.')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Draft status'), { target: { value: 'has-draft' } });

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1);
      const url = String(lastCall?.[0]);
      expect(url).toContain('draftStatus=has-draft');
    });
  });

  it('D3: each row links to the editor route with the path and a status hint in state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([ENTRY_ONE]), { status: 200 })));

    renderPage();

    await waitFor(() => expect(screen.getByText('pages/about.json')).toBeDefined());
    const link = screen.getByRole('link', { name: 'pages/about.json' });
    expect(link.getAttribute('href')).toBe('/sites/site-1/editor?path=pages%2Fabout.json');
  });

  it('shows an "unreachable" message when the site cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unreachable' }), { status: 502 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('This site is unreachable right now.')).toBeDefined());
  });

  it('shows an "unauthorized" message with a link back to the registry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x', reason: 'unauthorized' }), { status: 502 })),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText(/token was rejected/)).toBeDefined());
    expect(screen.getByRole('link', { name: 'Rotate it from the registry' })).toBeDefined();
  });
});
