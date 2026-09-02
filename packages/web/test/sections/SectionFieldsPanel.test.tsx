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

// The heading (with its own schema-derived title) and Close button now
// live in SectionFieldsPanelHeader (its own component, pushed to a
// separate useFieldsPanelHeader slot so it renders outside this
// panel's own scrolling body) - see SectionFieldsPanelHeader.test.tsx
// for that coverage. This file only covers the form/delete-button body.
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

    await waitFor(() => expect(screen.getByLabelText('Heading')).toBeDefined());
    expect((screen.getByLabelText('Heading') as HTMLInputElement).value).toBe('Hi');
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

    await waitFor(() => expect(screen.getByLabelText('Label')).toBeDefined());
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Click');
  });

  it('fades in from the right on open, and replays on every later switch to a different section/block', async () => {
    installFakeThemeSchemasFetch();
    const { rerender } = render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(document.querySelector('.fields-panel')?.className).toContain('tab-fade-in'));

    // This component is never remounted by PageEditorPage.tsx when the
    // selection changes (no key prop) - the same .fields-panel node
    // persists across selectedInstanceId changes, so this only proves
    // the effect actually replays the class rather than it having
    // simply been left over from the initial open above.
    rerender(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        selectedInstanceId="block-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Label')).toBeDefined());
    expect(document.querySelector('.fields-panel')?.className).toContain('tab-fade-in');
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

    await waitFor(() => expect(screen.getByLabelText('Heading')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'Changed' } });

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as { sections: Array<{ settings: { heading: string } }> };
    expect(updated.sections[0]?.settings.heading).toBe('Changed');
  });

  it('editing one section silently cleans a stale settings key on a DIFFERENT section on the same page', async () => {
    installFakeThemeSchemasFetch({
      sections: {
        hero: { type: 'object', properties: { heading: { type: 'string' } } },
        promo: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } } },
      },
      blocks: { button: { type: 'object', properties: { label: { type: 'string' } } } },
      acceptsBlocks: { sections: { hero: true, promo: false }, blocks: { button: false } },
    });
    const setContent = vi.fn();
    const page = JSON.parse(PAGE_WITH_SECTIONS) as { sections: unknown[] };
    page.sections.push({ id: 'section-2', type: 'promo', settings: { text: 'Hi', oldField: 'stale' } });

    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={JSON.stringify(page)}
        setContent={setContent}
        validationErrors={null}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText('Heading')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'Changed' } });

    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as {
      sections: Array<{ id: string; settings: Record<string, unknown> }>;
    };
    const promoSection = updated.sections.find((section) => section.id === 'section-2');
    expect(promoSection?.settings).toEqual({ text: 'Hi' });
  });

  it('I5: a validation error against a section field reaches that section\'s own field', async () => {
    installFakeThemeSchemasFetch();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/settings/heading', message: 'must NOT have fewer than 1 characters', keyword: 'minLength' }]}
        selectedInstanceId="section-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('This field is required.')).toBeDefined());
  });

  it('I5: a validation error against a nested block field reaches that block\'s own field, not the section\'s', async () => {
    installFakeThemeSchemasFetch();
    render(
      <SectionFieldsPanel
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/blocks/0/settings/label', message: 'must NOT have fewer than 1 characters', keyword: 'minLength' }]}
        selectedInstanceId="block-1"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('This field is required.')).toBeDefined());
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
});
