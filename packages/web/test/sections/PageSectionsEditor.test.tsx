import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PageSectionsEditor } from '../../src/sections/PageSectionsEditor.tsx';

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

describe('PageSectionsEditor', () => {
  it('shows a loading message while the theme schemas are being fetched', () => {
    installFakeThemeSchemasFetch();
    render(<PageSectionsEditor siteId="site-1" content={PAGE_WITH_SECTIONS} setContent={vi.fn()} validationErrors={null} />);

    expect(screen.getByText('Loading theme...')).toBeDefined();
  });

  it('shows an inline error if the theme schemas fail to load', async () => {
    const fetchMock = vi.fn(async () => new Response('not json', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<PageSectionsEditor siteId="site-1" content={PAGE_WITH_SECTIONS} setContent={vi.fn()} validationErrors={null} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('falls back to an explanatory message when the content has no sections array', async () => {
    installFakeThemeSchemasFetch();
    render(<PageSectionsEditor siteId="site-1" content={'{"title":"No sections here"}'} setContent={vi.fn()} validationErrors={null} />);

    await waitFor(() =>
      expect(screen.getByText("This content can't be shown in the structured editor - switch to raw JSON to edit it.")).toBeDefined(),
    );
  });

  it('I1, I3: renders title/published fields alongside the section list, seeded from the parsed content', async () => {
    installFakeThemeSchemasFetch();
    render(<PageSectionsEditor siteId="site-1" content={PAGE_WITH_SECTIONS} setContent={vi.fn()} validationErrors={null} />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toBeDefined());
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('About us');
    expect((screen.getByLabelText('Published') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('heading') as HTMLInputElement).value).toBe('Hi');
  });

  it('I6: editing the title re-serialises the whole page and calls setContent, preserving untouched fields', async () => {
    installFakeThemeSchemasFetch();
    const setContent = vi.fn();
    render(<PageSectionsEditor siteId="site-1" content={PAGE_WITH_SECTIONS} setContent={setContent} validationErrors={null} />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toBeDefined());
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } });

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(updated.title).toBe('New title');
    expect(updated.layout).toBe('default');
    expect(updated.schemaVersion).toBe(1);
  });

  it('I6: toggling published re-serialises and calls setContent - the same setContent the reorder/settings paths use', async () => {
    installFakeThemeSchemasFetch();
    const setContent = vi.fn();
    render(<PageSectionsEditor siteId="site-1" content={PAGE_WITH_SECTIONS} setContent={setContent} validationErrors={null} />);

    await waitFor(() => expect(screen.getByLabelText('Published')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Published'));

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(updated.published).toBe(false);
  });

  it('I5: a validation error against a section field reaches that section\'s own SchemaField', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/settings/heading', message: 'must be at least 1 character', keyword: 'minLength' }]}
      />,
    );

    await waitFor(() => expect(screen.getByText('must be at least 1 character')).toBeDefined());
  });

  it('I5: a validation error against a nested block field reaches that block\'s own SchemaField, not the section\'s', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/blocks/0/settings/label', message: 'must not be blank', keyword: 'minLength' }]}
      />,
    );

    await waitFor(() => expect(screen.getByText('must not be blank')).toBeDefined());
    // The section's own "heading" field must not also show this block-scoped error.
    const headingLabel = screen.getByLabelText('heading').closest('label') as HTMLElement;
    expect(headingLabel.textContent).not.toContain('must not be blank');
  });

  it('I1, I6: reordering sections through the rendered SectionList calls setContent with the reordered sections', async () => {
    installFakeThemeSchemasFetch();
    const setContent = vi.fn();
    const twoSections = JSON.stringify({
      title: 'Hi',
      published: false,
      sections: [
        { id: 'a', type: 'hero', settings: {} },
        { id: 'b', type: 'hero', settings: {} },
      ],
    });
    render(<PageSectionsEditor siteId="site-1" content={twoSections} setContent={setContent} validationErrors={null} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Move down' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0] as HTMLElement);

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as { sections: Array<{ id: string }> };
    expect(updated.sections.map((section) => section.id)).toEqual(['b', 'a']);
  });
});
