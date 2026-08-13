import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SectionFieldsPanel } from '../../src/sections/SectionFieldsPanel.tsx';

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

describe('SectionFieldsPanel', () => {
  it('shows a loading message while the theme schemas are being fetched', () => {
    installFakeThemeSchemasFetch();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading theme...')).toBeDefined();
  });

  it('shows an inline error if the theme schemas fail to load', async () => {
    const fetchMock = vi.fn(async () => new Response('not json', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('I3: shows the selected section\'s own settings, seeded from parsed content', async () => {
    installFakeThemeSchemasFetch();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('hero')).toBeDefined());
    expect((screen.getByLabelText('heading') as HTMLInputElement).value).toBe('Hi');
  });

  it('shows the selected block\'s own settings when a block, not a section, is selected', async () => {
    installFakeThemeSchemasFetch();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="block-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('button')).toBeDefined());
    expect((screen.getByLabelText('label') as HTMLInputElement).value).toBe('Click');
  });

  it('shows the theme schema\'s own "title", not the raw type slug, once one is declared', async () => {
    installFakeThemeSchemasFetch({
      sections: { hero: { type: 'object', title: 'Hero', properties: { heading: { type: 'string' } } } },
      blocks: { button: { type: 'object', properties: { label: { type: 'string' } } } },
      acceptsBlocks: { sections: { hero: true }, blocks: { button: false } },
    });
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Hero')).toBeDefined());
    expect(screen.queryByText('hero')).toBeNull();
  });

  it('I6: editing a field re-serialises the whole page and calls setContent - the same save path', async () => {
    installFakeThemeSchemasFetch();
    const setContent = vi.fn();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={setContent}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('heading')).toBeDefined());
    fireEvent.change(screen.getByLabelText('heading'), { target: { value: 'Changed' } });

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as { sections: Array<{ settings: { heading: string } }> };
    expect(updated.sections[0]?.settings.heading).toBe('Changed');
  });

  it('I5: a validation error against a section field reaches that section\'s own field', async () => {
    installFakeThemeSchemasFetch();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/settings/heading', message: 'must be at least 1 character', keyword: 'minLength' }]}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('must be at least 1 character')).toBeDefined());
  });

  it('I5: a validation error against a nested block field reaches that block\'s own field, not the section\'s', async () => {
    installFakeThemeSchemasFetch();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/blocks/0/settings/label', message: 'must not be blank', keyword: 'minLength' }]}
        selectedInstanceId="block-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('must not be blank')).toBeDefined());
    expect(screen.queryByLabelText('heading')).toBeNull();
  });

  it('shows "Delete Section" for a selected section, which removes it immediately (no confirmation) and closes the panel', async () => {
    installFakeThemeSchemasFetch();
    const setContent = vi.fn();
    const onClose = vi.fn();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={setContent}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={onClose}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Section' })).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Delete Block' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Section' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as { sections: unknown[] };
    expect(updated.sections).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "Delete Block" for a selected block, which removes just that block from its parent section', async () => {
    installFakeThemeSchemasFetch();
    const setContent = vi.fn();
    const onClose = vi.fn();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={setContent}
        validationErrors={null}
        selectedInstanceId="block-1"
        onClose={onClose}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Block' })).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Delete Section' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Block' }));

    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as {
      sections: Array<{ id: string; blocks: unknown[] }>;
    };
    expect(updated.sections).toHaveLength(1);
    expect(updated.sections[0]?.id).toBe('section-1');
    expect(updated.sections[0]?.blocks).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the close button calls onClose', async () => {
    installFakeThemeSchemasFetch();
    const onClose = vi.fn();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={onClose}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
