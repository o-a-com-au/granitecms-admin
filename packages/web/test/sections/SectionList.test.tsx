import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SectionList } from '../../src/sections/SectionList.tsx';
import type { Instance, ThemeTypeSchemas } from '../../src/sections/instance-types.ts';
import { createFakeDataTransfer } from '../helpers/fakeDataTransfer.ts';

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

  fireEvent.dragStart(fromHandle, { dataTransfer: createFakeDataTransfer() });
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

  it('reorders correctly when the drop lands above the very top row - genuinely outside every row\'s own hit-box, not just above its midpoint', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SectionList
        sections={[section('a'), section('b'), section('c')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const wrapper = container.firstElementChild as HTMLElement;
    const list = wrapper.querySelector('.instance-list') as HTMLElement;
    const rows = list.querySelectorAll('.instance-row');
    // Only the first and last row's own rects matter to
    // handleContainerDragOver now (not the list's own, which would
    // also wrongly match the flex gap between every OTHER pair of rows
    // - see that handler's own comment) - the middle row is left
    // unmocked deliberately, since a real fix must never need it.
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

    // Drag "c" (index 2) and release on the list's own padding above
    // the first row's own top edge (100) - is-dragging-active
    // (instance-rows.css) is what gives the list a real, hit-testable
    // part of its own box there during a drag, unlike the dead space
    // above it that existed outside every element's own box entirely
    // before that fix.
    //
    // Fired directly on the list itself, not a plain
    // fireEvent.dragOver(list, { clientY: 50 }) - jsdom has no
    // DragEvent constructor at all, so testing-library's own fallback
    // (a bare Event) silently drops clientY from the init dictionary
    // entirely (a bare Event never has that property). Patching it
    // directly onto the created event object first, since a bare Event
    // has no getter blocking a plain assignment the way a real
    // MouseEvent's clientY would, is what actually gets a real value
    // through to handleContainerDragOver's own comparison below. Also
    // has to be dispatched to the list element itself, not one of its
    // rows, for event.target === event.currentTarget to hold - that
    // check is what tells handleContainerDragOver this is genuinely on
    // the padding, not bubbled up from a row.
    fireEvent.dragStart(handles[2] as HTMLElement, { dataTransfer: createFakeDataTransfer() });
    const dragOverEvent = createEvent.dragOver(list);
    Object.assign(dragOverEvent, { clientY: 50 });
    fireEvent(list, dragOverEvent);
    fireEvent.drop(list);

    expect(onChange).toHaveBeenCalledWith([section('c'), section('a'), section('b')]);
  });

  it('does not snap the indicator to the top/bottom while hovering an ordinary gap between two middle rows', () => {
    const onChange = vi.fn();
    const { container } = render(
      <SectionList
        sections={[section('a'), section('b'), section('c'), section('d')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const wrapper = container.firstElementChild as HTMLElement;
    const list = wrapper.querySelector('.instance-list') as HTMLElement;
    const rows = list.querySelectorAll('.instance-row');
    // First and last rows sit far from the gap being tested (between
    // rows "b" and "c", in the middle) - if handleContainerDragOver
    // wrongly used the whole list's own midpoint instead of these,
    // this gap would incorrectly resolve to one end or the other.
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

    // Drag "d" (index 3) and hover the list's own flex gap between "b"
    // and "c" (somewhere around clientY 90-100, well inside the
    // 0-200 span the mocked first/last rows above establish, and
    // nowhere near either end) - firing directly on the list itself,
    // same as the test above, to land on that gap rather than bubble up
    // from a row.
    fireEvent.dragStart(handles[3] as HTMLElement, { dataTransfer: createFakeDataTransfer() });
    const dragOverEvent = createEvent.dragOver(list);
    Object.assign(dragOverEvent, { clientY: 95 });
    const preventDefaultSpy = vi.spyOn(dragOverEvent, 'preventDefault');
    fireEvent(list, dragOverEvent);

    // Called regardless of neither branch below matching - jsdom's own
    // fireEvent never enforces the real browser rule this is actually
    // for (a drop only succeeds where the immediately preceding
    // dragover called preventDefault()), so this is the only way a
    // test can verify it: confirming the call happened at all, not
    // that a drop released here would genuinely be accepted. Found
    // live as drops landing in an ordinary gap between two rows
    // silently failing, even with dropIndex still correctly set from
    // the row just above/below it, before this was unconditional.
    expect(preventDefaultSpy).toHaveBeenCalled();

    // Neither branch of handleContainerDragOver should have changed
    // dropIndex - the drop still lands wherever it was left by whatever
    // genuinely handled it (nothing else did here, so it's still null,
    // and the drop is a no-op) rather than snapping to 0 or the end.
    fireEvent.drop(list);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reorders correctly even when the drop lands exactly on the blue indicator line between two rows, not inside either row', () => {
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
    // Hovering the bottom half of "b" (index 1) renders the indicator
    // between "b" and "c" (dropIndex 2) - a real gap, not inside either
    // row's own box.
    fireEvent.dragOver(rows[1] as HTMLElement, { clientY: 35 });

    const indicator = document.querySelector('.drop-indicator') as HTMLElement;
    expect(indicator).not.toBeNull();

    // The drop lands exactly on the indicator's own hit-box, not back
    // on a row - it previously had no dragover/drop handlers of its
    // own, so a browser landing here during a real drag would never
    // call preventDefault() and silently rejected the drop (found live:
    // dropping right in the gap between two rows failed outright).
    fireEvent.dragOver(indicator);
    fireEvent.drop(indicator);

    expect(onChange).toHaveBeenCalledWith([section('b'), section('a'), section('c')]);
  });

  it('fades the dropped row back in once it lands in a genuinely different position', async () => {
    render(
      <SectionList
        sections={[section('a'), section('b'), section('c')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    const rowMain = rows[0]?.querySelector('.instance-row-main');

    dragOnto(handles[0] as HTMLElement, rows[2] as HTMLElement, 'bottom');

    // The class is applied a frame later (requestAnimationFrame), not
    // synchronously within the drop itself - deliberate, so it's real
    // React state driving the className rather than a classList.add
    // that a later, unrelated render could silently wipe out again
    // (found live: an isHighlighted change on the same row, from the
    // reorder itself shifting which row ends up under the cursor).
    await waitFor(() => expect(rowMain?.className).toContain('is-just-dropped'));
  });

  it('does not fade a row dropped back into the gap it started in (a no-op move)', () => {
    render(
      <SectionList
        sections={[section('a'), section('b'), section('c')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' });
    const rows = handles.map((handle) => handle.closest('li') as HTMLElement);
    const rowMain = rows[0]?.querySelector('.instance-row-main');

    dragOnto(handles[0] as HTMLElement, rows[0] as HTMLElement, 'top');

    expect(rowMain?.className).not.toContain('is-just-dropped');
  });

  it('pins a pill showing the section\'s own name to the cursor as the native drag image, Spotify-reorder style', () => {
    render(
      <SectionList
        sections={[section('a', 'hero')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    const handle = screen.getByRole('button', { name: 'Drag to reorder' });
    // Portaled to document.body (SectionList.tsx), not a descendant of
    // the row itself - escapes .editor-sidebar's own transform and
    // .editor-tab-content's overflow clipping in the real app, which
    // otherwise silently broke setDragImage below (found live).
    const pill = document.querySelector('.instance-row-drag-pill');
    expect(pill?.textContent).toBe('hero');

    const dataTransfer = { effectAllowed: 'none', setDragImage: vi.fn() };
    fireEvent.dragStart(handle, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(pill, 0, 12);
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

  it('reserves the arrow\'s column with an empty spacer on a row whose type has no blocks, so every label still lines up', () => {
    render(
      <SectionList
        sections={[section('a', 'hero'), section('b', 'faq')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    // hero accepts blocks (a real arrow, collapsed by default) - faq
    // doesn't (SECTION_TYPES above), so it gets the spacer instead.
    expect(screen.getByRole('button', { name: 'Expand' })).toBeDefined();
    const rows = screen.getAllByRole('button', { name: /^Edit /i });
    expect(rows[0]?.querySelector('.instance-row-chevron')).not.toBeNull();
    expect(rows[0]?.querySelector('.instance-row-chevron-spacer')).toBeNull();
    expect(rows[1]?.querySelector('.instance-row-chevron')).toBeNull();
    expect(rows[1]?.querySelector('.instance-row-chevron-spacer')).not.toBeNull();
  });

  it('expanding one section\'s blocks collapses whichever other section was already open - an accordion, not independent per-row state', () => {
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }, { ...section('c'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    const [expandA, expandC] = screen.getAllByRole('button', { name: 'Expand' });
    fireEvent.click(expandA as HTMLElement);
    expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Expand' })).toHaveLength(1);

    fireEvent.click(expandC as HTMLElement);
    // "a" is back to Expand (closed) - opening "c" closed it, rather
    // than both staying open at once.
    expect(screen.getAllByRole('button', { name: 'Collapse' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Expand' })).toHaveLength(1);
  });

  it('a section becomes the selected instance (blue background) and auto-expands its blocks, without needing a manual chevron click', () => {
    const { rerender } = render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
      />,
    );

    // Starts collapsed (I4's own precedent) and unselected.
    expect(screen.getByRole('button', { name: 'Expand' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Edit hero' }).className).not.toContain('is-selected');

    rerender(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
        selectedInstanceId="a"
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit hero' }).className).toContain('is-selected');
    // Auto-expanded - the chevron now reads "Collapse", and Add Block
    // (only rendered once expanded, per I4 above) is reachable without
    // an extra click.
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add Block' })).toBeDefined();
  });

  it('selecting a different section does not force a section the user manually collapsed back open', () => {
    const { rerender } = render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }, { ...section('c'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
        selectedInstanceId="a"
      />,
    );

    // "a" (selected) starts auto-expanded; "c" (unselected) starts
    // collapsed by default, same as I4's own precedent.
    const [collapseA] = screen.getAllByRole('button', { name: 'Collapse' });
    expect(screen.getAllByRole('button', { name: 'Expand' })).toHaveLength(1);
    fireEvent.click(collapseA as HTMLElement);
    // Both now read "Expand" - "a" manually, "c" still by default.
    expect(screen.getAllByRole('button', { name: 'Expand' })).toHaveLength(2);

    // Selecting the OTHER section ("c") - "a" must stay exactly as the
    // user left it (collapsed), not snap back open just because a
    // render happened. Only the section that actually BECOMES selected
    // gets the auto-expand treatment.
    rerender(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }, { ...section('c'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
        onEditInstance={vi.fn()}
        selectedInstanceId="c"
      />,
    );

    const rows = screen.getAllByRole('button', { name: /^Edit hero$/ });
    expect(rows[0]?.className).not.toContain('is-selected');
    expect(rows[1]?.className).toContain('is-selected');
    // "a" (now unselected) is still collapsed - only "c" (newly
    // selected) auto-expanded.
    expect(screen.getByRole('button', { name: 'Expand' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDefined();
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

  it('I4: removing a section removes it immediately, with no confirmation step, without also opening its Fields tab', () => {
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
    expect(screen.queryByRole('alertdialog')).toBeNull();
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
    // BLOCK_TYPES here declares only one type - Add Block skips the
    // picker and adds it directly.
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

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
    const typesWithTitle: ThemeTypeSchemas = {
      schemas: {
        hero: { type: 'object', title: 'Hero', properties: {} },
        faq: { type: 'object', title: 'FAQ', properties: {} },
      },
      acceptsBlocks: { hero: false, faq: false },
    };
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[section('a', 'hero')]}
        sectionTypes={typesWithTitle}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
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
    expect(onChange).toHaveBeenCalledWith([]);
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
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={restrictedSectionTypes}
        blockTypes={twoBlockTypes}
        onChange={onChange}
        onEditInstance={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    // Restricted down to exactly one type ('button', out of the two
    // twoBlockTypes declares overall) - Add Block skips the picker and
    // adds it directly, so there's no menu left to assert against
    // here; onChange having been called with a 'button' block is the
    // restriction actually taking effect.
    fireEvent.click(screen.getByRole('button', { name: 'Add Block' }));

    const [[updatedSections]] = onChange.mock.calls as [[Instance[]]];
    expect(updatedSections[0]?.blocks?.[0]?.type).toBe('button');
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
