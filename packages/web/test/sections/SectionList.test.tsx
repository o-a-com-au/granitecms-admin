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

describe('SectionList', () => {
  it('I1: move up/down reorders the array and calls onChange with the new order', () => {
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[section('a'), section('b'), section('c')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([section('b'), section('a'), section('c')]);
  });

  it('I2: the add-section type list is sourced from the fetched theme schemas, not hardcoded', () => {
    render(<SectionList sections={[]} sectionTypes={SECTION_TYPES} blockTypes={BLOCK_TYPES} onChange={vi.fn()} />);

    const select = screen.getByLabelText('Section type') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['hero', 'faq']);
  });

  it('I2: adding a section of a type that accepts blocks initialises blocks: []', () => {
    const onChange = vi.fn();
    render(<SectionList sections={[]} sectionTypes={SECTION_TYPES} blockTypes={BLOCK_TYPES} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));

    const [[newSections]] = onChange.mock.calls as [[Instance[]]];
    expect(newSections[0]?.type).toBe('hero');
    expect(newSections[0]?.blocks).toEqual([]);
  });

  it('I4: a section whose type accepts blocks shows block controls', () => {
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Block type')).toBeDefined();
  });

  it('I4: a section whose type does not accept blocks shows no block controls at all', () => {
    render(
      <SectionList
        sections={[section('a', 'faq', {})]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Block type')).toBeNull();
  });

  it('I4: removing a section asks for confirmation first', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[section('a'), section('b')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove section' })[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([section('b')]);
  });

  it('I5: a fieldErrors entry keyed by section id reaches that section\'s own settings form', () => {
    render(
      <SectionList
        sections={[section('a')]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        fieldErrors={{ a: { heading: 'must be at least 1 character' } }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('must be at least 1 character')).toBeDefined();
  });

  it('I6: adding a block within a section calls the same top-level onChange - one save path', () => {
    const onChange = vi.fn();
    render(
      <SectionList
        sections={[{ ...section('a'), blocks: [] }]}
        sectionTypes={SECTION_TYPES}
        blockTypes={BLOCK_TYPES}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [[updatedSections]] = onChange.mock.calls as [[Instance[]]];
    expect(updatedSections[0]?.blocks).toHaveLength(1);
    expect(updatedSections[0]?.blocks?.[0]?.type).toBe('button');
  });
});
