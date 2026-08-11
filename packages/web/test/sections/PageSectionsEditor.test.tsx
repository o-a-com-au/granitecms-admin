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
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="list"
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading theme...')).toBeDefined();
  });

  it('shows an inline error if the theme schemas fail to load', async () => {
    const fetchMock = vi.fn(async () => new Response('not json', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="list"
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('falls back to an explanatory message when the content has no sections array', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={'{"title":"No sections here"}'}
        setContent={vi.fn()}
        validationErrors={null}
        view="list"
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("This content can't be shown in the structured editor - switch to raw JSON to edit it.")).toBeDefined(),
    );
  });

  it('I1, I3: the list view renders just the section list, with no inline settings fields (Title/Published both live on the Metafields tab now)', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="list"
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByLabelText('Published')).toBeNull();
    expect(screen.queryByLabelText('heading')).toBeNull();
  });

  it('I3: clicking "Edit fields" on a section and switching to the Fields view shows that section\'s own settings, seeded from parsed content', async () => {
    installFakeThemeSchemasFetch();
    const onEditInstance = vi.fn();
    const { rerender } = render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="list"
        onEditInstance={onEditInstance}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));
    expect(onEditInstance).toHaveBeenCalledWith('section-1');

    rerender(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="fields"
        onEditInstance={onEditInstance}
      />,
    );

    expect(screen.getByText('hero')).toBeDefined();
    expect((screen.getByLabelText('heading') as HTMLInputElement).value).toBe('Hi');
  });

  it('the Fields view heading shows the theme schema\'s own "title", not the raw type slug, once one is declared', async () => {
    installFakeThemeSchemasFetch({
      sections: { hero: { type: 'object', title: 'Hero', properties: { heading: { type: 'string' } } } },
      blocks: { button: { type: 'object', properties: { label: { type: 'string' } } } },
      acceptsBlocks: { sections: { hero: true }, blocks: { button: false } },
    });
    const { rerender } = render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="list"
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit Hero' }));

    rerender(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="fields"
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByText('Hero')).toBeDefined();
    expect(screen.queryByText('hero')).toBeNull();
  });

  it('the Fields view shows a placeholder when nothing has been selected yet', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        view="fields"
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('Choose a section or block from the Sections tab to edit its fields.')).toBeDefined(),
    );
  });

  it('I6: editing a field in the Fields view re-serialises the whole page and calls setContent - the same save path', async () => {
    installFakeThemeSchemasFetch();
    const setContent = vi.fn();
    const { rerender } = render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={setContent}
        validationErrors={null}
        view="list"
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));

    rerender(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={setContent}
        validationErrors={null}
        view="fields"
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('heading'), { target: { value: 'Changed' } });

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as { sections: Array<{ settings: { heading: string } }> };
    expect(updated.sections[0]?.settings.heading).toBe('Changed');
  });

  it('I5: a validation error against a section field reaches that section\'s own field, once its Fields view is open', async () => {
    installFakeThemeSchemasFetch();
    const onEditInstance = vi.fn();
    const { rerender } = render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/settings/heading', message: 'must be at least 1 character', keyword: 'minLength' }]}
        view="list"
        onEditInstance={onEditInstance}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero (has an error)' })).toBeDefined());
    const sectionEditButton = screen.getByRole('button', { name: 'Edit hero (has an error)' });

    fireEvent.click(sectionEditButton);
    rerender(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/settings/heading', message: 'must be at least 1 character', keyword: 'minLength' }]}
        view="fields"
        onEditInstance={onEditInstance}
      />,
    );

    expect(screen.getByText('must be at least 1 character')).toBeDefined();
  });

  it('I5: a validation error against a nested block field reaches that block\'s own field, not the section\'s', async () => {
    installFakeThemeSchemasFetch();
    const onEditInstance = vi.fn();
    const { rerender } = render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/blocks/0/settings/label', message: 'must not be blank', keyword: 'minLength' }]}
        view="list"
        onEditInstance={onEditInstance}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    expect(screen.queryByRole('button', { name: 'Edit hero (has an error)' })).toBeNull(); // the section itself is clean

    // Sections with blocks start collapsed.
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    const blockEditButton = screen.getByRole('button', { name: 'Edit button (has an error)' });

    fireEvent.click(blockEditButton);
    rerender(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={[{ path: '/sections/0/blocks/0/settings/label', message: 'must not be blank', keyword: 'minLength' }]}
        view="fields"
        onEditInstance={onEditInstance}
      />,
    );

    expect(screen.getByText('must not be blank')).toBeDefined();
    expect(screen.queryByLabelText('heading')).toBeNull();
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
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={twoSections}
        setContent={setContent}
        validationErrors={null}
        view="list"
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Drag to reorder' })).toHaveLength(2));
    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    vi.spyOn(rows[1] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 40,
      bottom: 40,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.dragStart(handles[0] as HTMLElement);
    fireEvent.dragOver(rows[1] as HTMLElement, { clientY: 35 });
    fireEvent.drop(rows[1] as HTMLElement);

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as { sections: Array<{ id: string }> };
    expect(updated.sections.map((section) => section.id)).toEqual(['b', 'a']);
  });
});
