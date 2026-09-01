import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockList } from '../../src/sections/BlockList.tsx';
import type { Instance, ThemeTypeSchemas } from '../../src/sections/instance-types.ts';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

afterEach(() => {
  cleanup();
});

const BLOCK_TYPES: ThemeTypeSchemas = {
  schemas: {
    button: { type: 'object', properties: { label: { type: 'string' } } },
    group: { type: 'object', properties: {} },
  },
  acceptsBlocks: { button: false, group: true },
};

// settings defaults to {}, not { label: id } - BlockList.tsx's own
// dataDrivenLabel now prefers a real headline/heading/name/label field
// over the type's own schema title for a row's display text, so a
// non-empty default here would silently swap what most of this file's
// existing tests are actually asserting on (the type's own title, via
// schemaTitle) for whatever id string happened to be passed in.
function block(id: string, type = 'button', settings: Record<string, unknown> = {}): Instance {
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

  fireEvent.dragStart(fromHandle, { dataTransfer: createFakeDataTransfer() });
  fireEvent.dragOver(toRow, { clientY: half === 'top' ? 5 : 35 });
  fireEvent.drop(toRow);
}

describe('BlockList', () => {
  it('I1: dragging a row\'s handle onto another row reorders the array and calls onChange', () => {
    const onChange = vi.fn();
    render(
      <BlockList
        blocks={[block('a'), block('b'), block('c')]}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);

    dragOnto(handles[0] as HTMLElement, rows[2] as HTMLElement, 'bottom');

    expect(onChange).toHaveBeenCalledWith([block('b'), block('c'), block('a')]);
  });

  it('reorders correctly when the drop lands above the very top row - genuinely outside every row\'s own hit-box, not just above its midpoint', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BlockList blocks={[block('a'), block('b'), block('c')]} blockTypes={BLOCK_TYPES} onChange={onChange} onEditInstance={vi.fn()} />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const wrapper = container.firstElementChild as HTMLElement;
    const list = wrapper.querySelector('.instance-list') as HTMLElement;
    const rows = list.querySelectorAll('.instance-row');
    // Only the first and last row's own rects matter now, not the
    // list's - see SectionList.tsx's own equivalent test for why.
    vi.spyOn(rows[0] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      height: 40,
      bottom: 140,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(rows[2] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 260,
      height: 40,
      bottom: 300,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    // See SectionList.tsx's own equivalent test for why clientY has to
    // be patched onto the event manually (jsdom has no DragEvent
    // constructor, so testing-library's fallback plain Event silently
    // drops it from the init dictionary) and why it's dispatched to the
    // list itself, not the wrapper - event.target === event.currentTarget
    // is how handleContainerDragOver knows this is genuinely on the
    // list's own padding, not bubbled up from a row. 50 is above the
    // first row's own top edge (100).
    fireEvent.dragStart(handles[2] as HTMLElement, { dataTransfer: createFakeDataTransfer() });
    const dragOverEvent = createEvent.dragOver(list);
    Object.assign(dragOverEvent, { clientY: 50 });
    fireEvent(list, dragOverEvent);
    fireEvent.drop(list);

    expect(onChange).toHaveBeenCalledWith([block('c'), block('a'), block('b')]);
  });

  it('does not snap the indicator to the top/bottom while hovering an ordinary gap between two middle rows', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BlockList
        blocks={[block('a'), block('b'), block('c'), block('d')]}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const wrapper = container.firstElementChild as HTMLElement;
    const list = wrapper.querySelector('.instance-list') as HTMLElement;
    const rows = list.querySelectorAll('.instance-row');
    vi.spyOn(rows[0] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
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
    vi.spyOn(rows[3] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      top: 160,
      height: 40,
      bottom: 200,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.dragStart(handles[3] as HTMLElement, { dataTransfer: createFakeDataTransfer() });
    const dragOverEvent = createEvent.dragOver(list);
    Object.assign(dragOverEvent, { clientY: 95 });
    const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault');
    fireEvent(list, dragOverEvent);

    // See SectionList.tsx's own equivalent test for why this is the
    // only thing a jsdom-based test can verify here - it doesn't
    // enforce the real browser rule this exists for.
    expect(preventDefaultSpy).toHaveBeenCalled();

    fireEvent.drop(list);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('reorders correctly even when the drop lands exactly on the blue indicator line between two rows, not inside either row', () => {
    const onChange = vi.fn();
    render(
      <BlockList blocks={[block('a'), block('b'), block('c')]} blockTypes={BLOCK_TYPES} onChange={onChange} onEditInstance={vi.fn()} />,
    );

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

    const indicator = document.querySelector('.drop-indicator') as HTMLElement;
    expect(indicator).not.toBeNull();

    fireEvent.dragOver(indicator);
    fireEvent.drop(indicator);

    expect(onChange).toHaveBeenCalledWith([block('b'), block('a'), block('c')]);
  });

  it('fades the dropped row back in once it lands in a genuinely different position', async () => {
    render(
      <BlockList blocks={[block('a'), block('b'), block('c')]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} onEditInstance={vi.fn()} />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    const rowMain = rows[0]?.querySelector('.instance-row-main');

    dragOnto(handles[0] as HTMLElement, rows[2] as HTMLElement, 'bottom');

    // A frame later (requestAnimationFrame), not synchronous - see
    // SectionList.tsx's own equivalent test for why.
    await waitFor(() => expect(rowMain?.className).toContain('is-just-dropped'));
  });

  it('does not fade a row dropped back into the gap it started in (a no-op move)', () => {
    render(
      <BlockList blocks={[block('a'), block('b'), block('c')]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} onEditInstance={vi.fn()} />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    const rowMain = rows[0]?.querySelector('.instance-row-main');

    dragOnto(handles[0] as HTMLElement, rows[0] as HTMLElement, 'top');

    expect(rowMain?.className).not.toContain('is-just-dropped');
  });

  it('pins a pill showing the block\'s own name to the cursor as the native drag image, Spotify-reorder style', () => {
    render(<BlockList blocks={[block('a', 'button')]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} onEditInstance={vi.fn()} />);

    const handle = screen.getByRole('button', { name: 'Drag to reorder' });
    // Portaled to document.body (BlockList.tsx) - see SectionList.tsx's
    // own equivalent test for why.
    const pill = document.querySelector('.instance-row-drag-pill');
    expect(pill?.textContent).toBe('button');

    const dataTransfer = { effectAllowed: 'none', setDragImage: vi.fn() };
    fireEvent.dragStart(handle, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(pill, 0, 12);
  });

  it('I2: the add-block menu lists types sourced from the fetched theme schemas, not hardcoded', () => {
    render(<BlockList blocks={[]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} onEditInstance={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['button', 'group']);
  });

  it('I2: picking a type from the add-block menu appends a new instance with a generated id and that type, and closes the menu', () => {
    const onChange = vi.fn();
    render(<BlockList blocks={[]} blockTypes={BLOCK_TYPES} onChange={onChange} onEditInstance={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'button' }));

    const [newBlocks] = onChange.mock.calls[0] as [Instance[]];
    expect(newBlocks).toHaveLength(1);
    expect(newBlocks[0]?.type).toBe('button');
    expect(typeof newBlocks[0]?.id).toBe('string');
    expect(newBlocks[0]?.id.length).toBeGreaterThan(0);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('when only one block type is available, Add Block skips the picker entirely and adds that type directly', () => {
    const onChange = vi.fn();
    render(
      <BlockList blocks={[]} blockTypes={BLOCK_TYPES} allowedTypes={['button']} onChange={onChange} onEditInstance={vi.fn()} />,
    );

    const addButton = screen.getByRole('button', { name: 'Add Block' });
    // No popup to announce - aria-haspopup/aria-expanded would be
    // actively misleading on a button that never opens one.
    expect(addButton.getAttribute('aria-haspopup')).toBeNull();
    expect(addButton.getAttribute('aria-expanded')).toBeNull();

    fireEvent.click(addButton);

    expect(screen.queryByRole('menuitem')).toBeNull();
    const [newBlocks] = onChange.mock.calls[0] as [Instance[]];
    expect(newBlocks).toHaveLength(1);
    expect(newBlocks[0]?.type).toBe('button');
  });

  it('L3: a newly-added block is pre-filled from its schema\'s declared defaults, not left empty', () => {
    const typesWithDefaults: ThemeTypeSchemas = {
      schemas: {
        button: {
          type: 'object',
          required: ['label', 'url'],
          properties: {
            label: { type: 'string', minLength: 1, default: 'Learn more' },
            url: { type: 'string', minLength: 1, default: '#' },
          },
        },
      },
      acceptsBlocks: { button: false },
    };
    const onChange = vi.fn();
    render(<BlockList blocks={[]} blockTypes={typesWithDefaults} onChange={onChange} onEditInstance={vi.fn()} />);

    // Only one type is declared here - Add Block skips the picker
    // entirely and adds it directly (see the dedicated test for that).
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    const [newBlocks] = onChange.mock.calls[0] as [Instance[]];
    expect(newBlocks[0]?.settings).toEqual({ label: 'Learn more', url: '#' });
  });

  it('L3: a block type with no declared defaults still starts with empty settings (regression)', () => {
    const onChange = vi.fn();
    render(<BlockList blocks={[]} blockTypes={BLOCK_TYPES} onChange={onChange} onEditInstance={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'button' }));

    const [newBlocks] = onChange.mock.calls[0] as [Instance[]];
    expect(newBlocks[0]?.settings).toEqual({});
  });

  it('clicking outside the open add-block menu closes it without adding anything', () => {
    const onChange = vi.fn();
    render(
      <div>
        <button type="button">outside</button>
        <BlockList blocks={[]} blockTypes={BLOCK_TYPES} onChange={onChange} onEditInstance={vi.fn()} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));

    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('I4: removing a block removes it immediately, with no confirmation step, without also opening its Fields tab', () => {
    const onChange = vi.fn();
    const onEditInstance = vi.fn();
    render(
      <BlockList
        blocks={[block('a'), block('b')]}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={onEditInstance}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove block' })[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([block('b')]);
    expect(onEditInstance).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('I4: a block whose type accepts nested blocks renders its own nested BlockList once expanded (blocks with nested blocks start collapsed)', () => {
    render(
      <BlockList
        blocks={[{ id: 'g1', type: 'group', settings: {}, blocks: [block('nested')] }]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    // Only the outer Add Block button is visible until expanded.
    expect(screen.getAllByRole('button', { name: 'Add Block' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    // Two Add Block buttons: the outer add-menu and the nested one.
    expect(screen.getAllByRole('button', { name: 'Add Block' })).toHaveLength(2);
  });

  it('reserves the arrow\'s column with an empty spacer on a row whose type has no nested blocks, so every label still lines up', () => {
    render(
      <BlockList
        blocks={[
          { id: 'g1', type: 'group', settings: {}, blocks: [] },
          block('b1'),
        ]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    // group nests further blocks (a real arrow, collapsed by default) -
    // button doesn't (BLOCK_TYPES above), so it gets the spacer instead.
    expect(screen.getByRole('button', { name: 'Expand' })).toBeDefined();
    const rows = screen.getAllByRole('button', { name: /^Edit /i });
    expect(rows[0]?.querySelector('.instance-row-chevron')).not.toBeNull();
    expect(rows[0]?.querySelector('.instance-row-chevron-spacer')).toBeNull();
    expect(rows[1]?.querySelector('.instance-row-chevron')).toBeNull();
    expect(rows[1]?.querySelector('.instance-row-chevron-spacer')).not.toBeNull();
  });

  it('expanding one block\'s nested blocks collapses whichever sibling block was already open - an accordion, not independent per-row state', () => {
    render(
      <BlockList
        blocks={[
          { id: 'g1', type: 'group', settings: {}, blocks: [] },
          { id: 'g2', type: 'group', settings: {}, blocks: [] },
        ]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    const [expandG1, expandG2] = screen.getAllByRole('button', { name: 'Expand' });
    fireEvent.click(expandG1 as HTMLElement);
    expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Expand' })).toHaveLength(1);

    fireEvent.click(expandG2 as HTMLElement);
    expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Expand' })).toHaveLength(1);
  });

  it('a block becomes the selected instance (blue background) and auto-expands its nested blocks, without needing a manual chevron click', () => {
    const { rerender } = render(
      <BlockList
        blocks={[{ id: 'g1', type: 'group', settings: {}, blocks: [block('nested')] }]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Expand' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit group' }).className).not.toContain('is-selected');

    rerender(
      <BlockList
        blocks={[{ id: 'g1', type: 'group', settings: {}, blocks: [block('nested')] }]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
        selectedInstanceId="g1"
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit group' }).className).toContain('is-selected');
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDefined();
    // The nested block ("nested") is now visible without an extra click.
    expect(screen.getByRole('button', { name: 'Edit button' })).toBeDefined();
  });

  it('I4: a block whose type does not accept nested blocks shows no nested block controls', () => {
    render(<BlockList blocks={[block('a')]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} onEditInstance={vi.fn()} />);

    // Only the one top-level add-menu - no nested one for the button block.
    expect(screen.getAllByRole('button', { name: 'Add Block' })).toHaveLength(1);
  });

  it('clicking a block row (not its remove/drag controls) calls onEditInstance with that block\'s id - settings no longer render inline here', () => {
    const onEditInstance = vi.fn();
    render(
      <BlockList
        blocks={[block('a'), block('b')]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={onEditInstance}
      />,
    );

    expect(screen.queryByLabelText('label')).toBeNull();
    // Both rows are type "button" (the default in the block() helper),
    // so their accessible names are identical - target by position.
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit button' })[1] as HTMLElement);

    expect(onEditInstance).toHaveBeenCalledWith('b');
  });

  it('I5: a fieldErrors entry keyed by block id is surfaced as an accessible "(has an error)" suffix on that row', () => {
    render(
      <BlockList
        blocks={[block('a'), block('b')]}
        blockTypes={BLOCK_TYPES}
        fieldErrors={{ a: { label: 'must be a string' } }}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit button (has an error)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit button' })).toBeDefined();
  });

  it('I6: dragging a nested block calls the same top-level onChange - one save path, not a parallel one', () => {
    const onChange = vi.fn();
    render(
      <BlockList
        blocks={[{ id: 'g1', type: 'group', settings: {}, blocks: [block('nested-a'), block('nested-b')] }]}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    // Index 0 is the outer "g1" block's own handle - index 1/2 are the
    // nested blocks'.
    dragOnto(handles[1] as HTMLElement, rows[2] as HTMLElement, 'bottom');

    expect(onChange).toHaveBeenCalledTimes(1);
    const [[updated]] = onChange.mock.calls as [[Instance[]]];
    expect(updated[0]?.blocks?.map((b) => b.id)).toEqual(['nested-b', 'nested-a']);
  });

  it('the chevron collapses and expands a block\'s nested blocks without opening its Fields tab', () => {
    const onEditInstance = vi.fn();
    render(
      <BlockList
        blocks={[{ id: 'g1', type: 'group', settings: {}, blocks: [block('nested')] }]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={onEditInstance}
      />,
    );

    // Blocks with nested blocks start collapsed.
    expect(screen.queryByRole('button', { name: 'Edit button' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByRole('button', { name: 'Edit button' })).toBeDefined();
    expect(onEditInstance).not.toHaveBeenCalled();
  });

  it('shows the theme schema\'s own "title", not the raw type slug, once one is declared', () => {
    const typesWithTitle: ThemeTypeSchemas = {
      schemas: {
        button: { type: 'object', title: 'Button', properties: {} },
        group: { type: 'object', title: 'Group', properties: {} },
      },
      acceptsBlocks: { button: false, group: true },
    };
    const onChange = vi.fn();
    render(
      <BlockList blocks={[block('a', 'button')]} blockTypes={typesWithTitle} onChange={onChange} onEditInstance={vi.fn()} />,
    );

    expect(screen.getByText('Button', { selector: 'strong' })).toBeDefined();
    expect(screen.queryByText('button')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Button' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));
    expect(screen.getByRole('menuitem', { name: 'Button' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Group' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove block' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("prefers a real headline/heading/name/label field from the block's own settings over its type's schema title", () => {
    const typesWithTitle: ThemeTypeSchemas = {
      schemas: { button: { type: 'object', title: 'Button', properties: {} } },
      acceptsBlocks: { button: false },
    };
    render(
      <BlockList
        blocks={[block('a', 'button', { label: 'Learn more' })]}
        blockTypes={typesWithTitle}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByText('Learn more', { selector: 'strong' })).toBeDefined();
    expect(screen.queryByText('Button', { selector: 'strong' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Learn more' })).toBeDefined();
  });

  it('observes the priority order headline > heading > name > label for the row label, same as dataDrivenLabel itself', () => {
    render(
      <BlockList
        blocks={[block('a', 'button', { label: 'D', name: 'C', heading: 'B', headline: 'A' })]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByText('A', { selector: 'strong' })).toBeDefined();
  });

  it("falls back to the type's own schema title when none of headline/heading/name/label are present in settings, same as before", () => {
    const typesWithTitle: ThemeTypeSchemas = {
      schemas: { button: { type: 'object', title: 'Button', properties: {} } },
      acceptsBlocks: { button: false },
    };
    render(
      <BlockList
        blocks={[block('a', 'button', { url: '#', style: 'primary' })]}
        blockTypes={typesWithTitle}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    expect(screen.getByText('Button', { selector: 'strong' })).toBeDefined();
  });

  it('K4: the add-block menu is restricted to allowedTypes when the parent schema declares one', () => {
    const onChange = vi.fn();
    render(<BlockList blocks={[]} blockTypes={BLOCK_TYPES} allowedTypes={['button']} onChange={onChange} onEditInstance={vi.fn()} />);

    // Restricted down to exactly one type - Add Block skips the picker
    // and adds it directly, so there's no menu left to assert against
    // here; onChange having been called with a 'button' block is the
    // restriction actually taking effect.
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    const [newBlocks] = onChange.mock.calls[0] as [Instance[]];
    expect(newBlocks[0]?.type).toBe('button');
  });

  it('K4: the add-block menu is unrestricted when allowedTypes is omitted (regression)', () => {
    render(<BlockList blocks={[]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} onEditInstance={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['button', 'group']);
  });

  it('K4: a nested block\'s own allowedBlocks restricts its own nested add-block menu, independent of the outer one', () => {
    const typesWithNestedRestriction: ThemeTypeSchemas = {
      schemas: {
        button: { type: 'object', properties: {} },
        group: { type: 'object', properties: {}, allowedBlocks: ['button'] },
      },
      acceptsBlocks: { button: false, group: true },
    };
    const onChange = vi.fn();
    render(
      <BlockList
        blocks={[{ id: 'g1', type: 'group', settings: {}, blocks: [] }]}
        blockTypes={typesWithNestedRestriction}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    // Outer menu (for the top-level group/button choice) stays unrestricted.
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['button', 'group']);
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    // The nested add-menu, inside the group block, is restricted to
    // its own allowedBlocks - down to exactly one type here, so Add
    // Block there skips the picker and adds it directly (same as any
    // other single-type list) rather than opening a one-item menu. It
    // sits inside the row's own <li>, so it precedes the outer
    // add-button (rendered after the whole <ul>) in DOM order.
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    const addButtons = screen.getAllByRole('button', { name: 'Add Block' });
    fireEvent.click(addButtons[0] as HTMLElement);

    const [newBlocks] = onChange.mock.calls[0] as [Instance[]];
    expect(newBlocks[0]?.blocks?.[0]?.type).toBe('button');
  });
});
