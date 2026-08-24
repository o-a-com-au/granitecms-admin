import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PageSectionsEditor } from '../../src/sections/PageSectionsEditor.tsx';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

// I3/I6's own "Fields" behaviour (seeding, editing, validation errors)
// now lives in SectionFieldsPanel.test.tsx - the revised layout
// (docs/designs/Revised-Page-Edit--Section-Edit.png) made that a
// separate, independently-mounted right-hand panel rather than a mode
// of this component, so this file only covers the Sections list itself.
describe('PageSectionsEditor', () => {
  it('shows the Sections heading immediately, but holds off the skeleton row until the fetch has been running a full second', async () => {
    vi.useFakeTimers();
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByText('Sections')).toBeDefined();
    expect(document.querySelector('.sections-skeleton-row')).toBeNull();
    expect(screen.queryByText('Loading theme...')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(document.querySelector('.sections-skeleton-row')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.sections-skeleton-row')).not.toBeNull();

    // Settles the still-pending fetch so it can't resolve after the
    // test finishes and warn about an update outside act().
    await act(async () => {
      resolveFetch(new Response(JSON.stringify(THEME_SCHEMAS_BODY), { status: 200 }));
    });
  });

  it('never shows the skeleton row at all when the fetch settles inside the first second', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    expect(document.querySelector('.sections-skeleton-row')).toBeNull();
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
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText('Sections')).toBeDefined();
  });

  it('falls back to an explanatory message when the content has no sections array', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={'{"title":"No sections here"}'}
        setContent={vi.fn()}
        validationErrors={null}
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("This content can't be shown in the structured editor - switch to raw JSON to edit it.")).toBeDefined(),
    );
  });

  it('I1, I3: renders just the section list, with no inline settings fields (Title/Published both live on the Metafields tab now)', async () => {
    installFakeThemeSchemasFetch();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        onEditInstance={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByLabelText('Published')).toBeNull();
    expect(screen.queryByLabelText('heading')).toBeNull();
  });

  it('clicking a section calls onEditInstance with its id - opening its fields is the parent\'s job now, not a mode switch here', async () => {
    installFakeThemeSchemasFetch();
    const onEditInstance = vi.fn();
    render(
      <PageSectionsEditor
        siteId="site-1"
        content={PAGE_WITH_SECTIONS}
        setContent={vi.fn()}
        validationErrors={null}
        onEditInstance={onEditInstance}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Edit hero' }));

    expect(onEditInstance).toHaveBeenCalledWith('section-1');
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
    fireEvent.dragStart(handles[0] as HTMLElement, { dataTransfer: createFakeDataTransfer() });
    fireEvent.dragOver(rows[1] as HTMLElement, { clientY: 35 });
    fireEvent.drop(rows[1] as HTMLElement);

    expect(setContent).toHaveBeenCalledTimes(1);
    const updated = JSON.parse(setContent.mock.calls[0]?.[0] as string) as { sections: Array<{ id: string }> };
    expect(updated.sections.map((section) => section.id)).toEqual(['b', 'a']);
  });
});
