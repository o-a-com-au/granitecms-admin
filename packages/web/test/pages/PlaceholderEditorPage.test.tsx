import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PlaceholderEditorPage } from '../../src/pages/PlaceholderEditorPage.tsx';

function renderPage(initialEntry: { pathname: string; search?: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/sites/:siteId/editor" element={<PlaceholderEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlaceholderEditorPage', () => {
  it('D3: renders the site id and path from the URL alone, with no router state', () => {
    renderPage({ pathname: '/sites/site-1/editor', search: '?path=pages%2Fabout.json' });

    expect(screen.getByText('site-1')).toBeDefined();
    expect(screen.getByText('pages/about.json')).toBeDefined();
    expect(screen.getByText('Open the content list to see its current status.')).toBeDefined();
    expect(screen.getByText(/coming in Group E/)).toBeDefined();
  });

  it('renders a status hint when router state is present', () => {
    renderPage({
      pathname: '/sites/site-1/editor',
      search: '?path=pages%2Fabout.json',
      state: { hasDraft: true, published: true },
    });

    expect(screen.getByText(/Currently: live, with a pending draft/)).toBeDefined();
  });

  it('renders sensibly on a direct hit with no path query param at all', () => {
    renderPage({ pathname: '/sites/site-1/editor' });

    expect(screen.getByText('site-1')).toBeDefined();
  });
});
