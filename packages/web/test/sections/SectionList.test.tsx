import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SectionList } from '../../src/sections/SectionList.tsx';
import type { Instance, ThemeTypeSchemas } from '../../src/sections/instance-types.ts';

afterEach(() => {
  cleanup();
});

const SECTION_TYPES: ThemeTypeSchemas = {
  schemas: {
    hero: { type: 'object', properties: { heading: { type: 'string' } } },
    faq: { type: 'object', properties: {} },
  },
  acceptsBlocks: { hero: true, faq: false },
};

const BLOCK_TYPES: ThemeTypeSchemas = {
  schemas: { button: { type: 'object', properties: { label: { type: 'string' } } } },
  acceptsBlocks: { button: false },
};

function section(id: string, type = 'hero', settings: Record<string, unknown> = { heading: id }): Instance {
  return { id, type, settings };
}

// Simulates dragging fromHandle onto toRow, landing in either the top
// or bottom half of toRow's (mocked, since jsdom never lays anything
// out) bounding rect.
function dragOnto(fromHandle: HTMLElement, toRow: HTMLElement, half: 'top' | 'bottom'): void {
  vi.spyOn(toRow, 'getBoundingClientRect').mockReturnValue({
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

  fireEvent.dragStart(fromHandle);
  fireEvent.dragOver(toRow, { clientY: half === 'top' ? 5 : 35 });
  fireEvent.drop(toRow);
}

describe('SectionList', () => {
  it('I1: dragging a row\'s handle onto another row reorders the array and calls onChange', () => {
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[section('a'), section('b'), section('c')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);

    // Drag "a" (index 0) onto the bottom half of "c" (index 2) - drops after c.
    dragOnto(handles[0] as HTMLElement, rows[2] as HTMLElement, 'bottom');

    expect(onChange).toHaveBeenCalledWith([section('b'), section('c'), section('a')]);
  });

  it('I2: the add-section menu lists types sourced from the fetched theme schemas, not hardcoded', () => {
    render(
      <SectionList
        sections={[]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['hero', 'faq']);
  });

  it('I2: picking a type from the add-section menu adds it, closes the menu, and (for a type that accepts blocks) initialises blocks: []', () => {
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'hero' }));

    const [[newSections]] = onChange.mock.calls as [[Instance[]]];
    expect(newSections[0]?.type).toBe('hero');
    expect(newSections[0]?.blocks).toEqual([]);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('L3: a newly-added section is pre-filled from its schema\'s declared defaults, not left empty', () => {
    const typesWithDefaults: ThemeTypeSchemas = {
      schemas: {
        hero: {
          type: 'object',
          required: ['heading'],
          properties: { heading: { type: 'string', minLength: 1, default: 'New Section' } },
        },
      },
      acceptsBlocks: { hero: false },
    };
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[]}
        sectionTypes={typesWithDefaults}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'hero' }));

    const [[newSections]] = onChange.mock.calls as [[Instance[]]];
    expect(newSections[0]?.settings).toEqual({ heading: 'New Section' });
  });

  it('L3: a section type with no declared defaults still starts with empty settings (regression)', () => {
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'hero' }));

    const [[newSections]] = onChange.mock.calls as [[Instance[]]];
    expect(newSections[0]?.settings).toEqual({});
  });

  it('clicking outside the open add-section menu closes it without adding anything', () => {
    const onChange = vi.fn();
    render(
      <div>
        <button type="button">outside</button>
        <SectionList
          sections={[]}
          sectionTypes={SECTION_TYPES}
          blockTypes={BLOCK_TYPES}
          onChange={onChange}
          onEditInstance={vi.fn()}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));

    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('I4: a section whose type accepts blocks shows block controls once expanded (sections with blocks start collapsed)', () => {
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Expand' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add Block' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByRole('button', { name: 'Add Block' })).toBeDefined();
  });

  it('I4: a section whose type does not accept blocks shows no block controls at all', () => {
    render(
      <SectionList
        sections={[section('a', 'faq', {})]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Add Block' })).toBeNull();
  });

  it('I4: removing a section asks for confirmation first, without also opening its Fields tab', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    const onEditInstance = vi.fn();
    render(
      <SectionList
        sections={[section('a'), section('b')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={onEditInstance}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove section' })[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([section('b')]);
    expect(onEditInstance).not.toHaveBeenCalled();
  });

  it('clicking a section row (not its remove/drag controls) calls onEditInstance with that section\'s id - settings no longer render inline here', () => {
    const onEditInstance = vi.fn();
    render(
      <SectionList
        sections={[section('a'), section('b')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={onEditInstance}
      />,
    );

    expect(screen.queryByLabelText('heading')).toBeNull();
    // Both rows are type "hero" (the default in the section() helper),
    // so their accessible names are identical - target by position.
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit hero' })[1] as HTMLElement);

    expect(onEditInstance).toHaveBeenCalledWith('b');
  });

  it('hovering a section row calls onHighlightSection with that section\'s id, and leaving it calls it with null', () => {
    const onHighlightSection = vi.fn();
    render(
      <SectionList
        sections={[section('a'), section('b')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
        onHighlightSection={onHighlightSection}
      />,
    );

    const rows = screen.getAllByRole('button', { name: 'Edit hero' });
    fireEvent.mouseEnter(rows[1] as HTMLElement);
    expect(onHighlightSection).toHaveBeenCalledWith('b');

    fireEvent.mouseLeave(rows[1] as HTMLElement);
    expect(onHighlightSection).toHaveBeenCalledWith(null);
  });

  it('I5: a fieldErrors entry keyed by section id is surfaced as an accessible "(has an error)" suffix on that row', () => {
    render(
      <SectionList
        sections={[section('a'), section('b')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        fieldErrors={{ a: { heading: 'must be at least 1 character' } }}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit hero (has an error)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit hero' })).toBeDefined();
  });

  it('I6: adding a block within a section calls the same top-level onChange - one save path', () => {
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'button' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [[updatedSections]] = onChange.mock.calls as [[Instance[]]];
    expect(updatedSections[0]?.blocks).toHaveLength(1);
    expect(updatedSections[0]?.blocks?.[0]?.type).toBe('button');
  });

  it('clicking a nested block row calls onEditInstance with the block\'s own id', () => {
    const onEditInstance = vi.fn();
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [{ id: 'blk-1', type: 'button', settings: {} }] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={onEditInstance}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit button' }));

    expect(onEditInstance).toHaveBeenCalledWith('blk-1');
  });

  it('the chevron collapses and expands a section\'s nested blocks without opening its Fields tab', () => {
    const onEditInstance = vi.fn();
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [{ id: 'blk-1', type: 'button', settings: {} }] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={onEditInstance}
      />,
    );

    // Sections with blocks start collapsed.
    expect(screen.queryByRole('button', { name: 'Edit button' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByRole('button', { name: 'Edit button' })).toBeDefined();
    expect(onEditInstance).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByRole('button', { name: 'Edit button' })).toBeNull();
  });

  it('shows the theme schema\'s own "title", not the raw type slug, once one is declared', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const typesWithTitle: ThemeTypeSchemas = {
      schemas: {
        hero: { type: 'object', title: 'Hero', properties: {} },
        faq: { type: 'object', title: 'FAQ', properties: {} },
      },
      acceptsBlocks: { hero: false, faq: false },
    };
    render(
      <SectionList
        sections={[section('a', 'hero')]}
        sectionTypes={typesWithTitle}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByText('Hero', { selector: 'strong' })).toBeDefined();
    expect(screen.queryByText('hero')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Hero' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }));
    expect(screen.getByRole('menuitem', { name: 'Hero' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'FAQ' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove section' }));
    expect(window.confirm).toHaveBeenCalledWith('Remove this "Hero" section? This cannot be undone.');
  });

  it('K4: a section\'s own allowedBlocks restricts its Add Block menu to just those types', () => {
    const restrictedSectionTypes: ThemeTypeSchemas = {
      schemas: {
        hero: { type: 'object', properties: {}, allowedBlocks: ['button'] },
      },
      acceptsBlocks: { hero: true },
    };
    const twoBlockTypes: ThemeTypeSchemas = {
      schemas: {
        button: { type: 'object', properties: {} },
        group: { type: 'object', properties: {} },
      },
      acceptsBlocks: { button: false, group: false },
    };
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={restrictedSectionTypes}
        blockTypes={twoBlockTypes}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['button']);
  });

  it('K4: a section with no allowedBlocks offers every block type (regression)', () => {
    const twoBlockTypes: ThemeTypeSchemas = {
      schemas: {
        button: { type: 'object', properties: {} },
        group: { type: 'object', properties: {} },
      },
      acceptsBlocks: { button: false, group: false },
    };
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={twoBlockTypes}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['button', 'group']);
  });
});
