import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SectionFieldsPanelHeader } from '../../src/sections/SectionFieldsPanelHeader.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const THEME_SCHEMAS_BODY = {
  sections: { hero: { type: 'object', properties: { heading: { type: 'string' } } } },
  blocks: { button: { type: 'object', properties: { label: { type: 'string' } } } },
  acceptsBlocks: { sections: { hero: true }, blocks: { button: false } },
};

function installFakeThemeSchemasFetch(body: unknown = THEME_SCHEMAS_BODY, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const PAGE_WITH_SECTIONS = JSON.stringify({
  schemaVersion: 1,
  title: 'About us',
  published: true,
  layout: 'default',
  sections: [
    {
      id: 'section-1',
      type: 'hero',
      settings: { heading: 'Hi' },
      blocks: [{ id: 'block-1', type: 'button', settings: { label: 'Click' } }],
    },
  ],
});

describe('SectionFieldsPanelHeader', () => {
  it('shows the raw type slug as a fallback title until the theme schema loads', async () => {
    installFakeThemeSchemasFetch();
    render(<SectionFieldsPanelHeader siteId="site-1" content={PAGE_WITH_SECTIONS} selectedInstanceId="section-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('hero')).toBeDefined());
  });

  it('shows the theme schema\'s own "title", not the raw type slug, once one is declared', async () => {
    installFakeThemeSchemasFetch({
      sections: { hero: { type: 'object', title: 'Hero', properties: { heading: { type: 'string' } } } },
      blocks: { button: { type: 'object', properties: { label: { type: 'string' } } } },
      acceptsBlocks: { sections: { hero: true }, blocks: { button: false } },
    });
    render(<SectionFieldsPanelHeader siteId="site-1" content={PAGE_WITH_SECTIONS} selectedInstanceId="section-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Hero')).toBeDefined());
    expect(screen.queryByText('hero')).toBeNull();
  });

  it('shows the selected block\'s own title, not the parent section\'s', async () => {
    installFakeThemeSchemasFetch();
    render(<SectionFieldsPanelHeader siteId="site-1" content={PAGE_WITH_SECTIONS} selectedInstanceId="block-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('button')).toBeDefined());
  });

  it('clicking the close button calls onClose, even before the theme schema has loaded', () => {
    installFakeThemeSchemasFetch();
    const onClose = vi.fn();
    render(<SectionFieldsPanelHeader siteId="site-1" content={PAGE_WITH_SECTIONS} selectedInstanceId="section-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
