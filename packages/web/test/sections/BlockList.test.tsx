import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BlockList } from '../../src/sections/BlockList.tsx';
import type { Instance, ThemeTypeSchemas } from '../../src/sections/instance-types.ts';

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

function block(id: string, type = 'button', settings: Record<string, unknown> = { label: id }): Instance {
  return { id, type, settings };
}

describe('BlockList', () => {
  it('I1: move up/down reorders the array and calls onChange with the new order', () => {
    const onChange = vi.fn();
    render(
      <BlockList blocks={[block('a'), block('b'), block('c')]} blockTypes={BLOCK_TYPES} onChange={onChange} />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([block('b'), block('a'), block('c')]);
  });

  it('I1: move up is disabled on the first row, move down is disabled on the last row', () => {
    render(<BlockList blocks={[block('a'), block('b')]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} />);

    const moveUps = screen.getAllByRole('button', { name: 'Move up' });
    const moveDowns = screen.getAllByRole('button', { name: 'Move down' });
    expect(moveUps[0]?.hasAttribute('disabled')).toBe(true);
    expect(moveDowns[moveDowns.length - 1]?.hasAttribute('disabled')).toBe(true);
  });

  it('I2: the add-block type list is sourced from the fetched theme schemas, not hardcoded', () => {
    render(<BlockList blocks={[]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} />);

    const select = screen.getByLabelText('Block type') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((option) => option.value);
    expect(optionValues).toEqual(['button', 'group']);
  });

  it('I2: adding a block appends a new instance with a generated id and the selected type', () => {
    const onChange = vi.fn();
    render(<BlockList blocks={[]} blockTypes={BLOCK_TYPES} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add block' }));

    const [newBlocks] = onChange.mock.calls[0] as [Instance[]];
    expect(newBlocks).toHaveLength(1);
    expect(newBlocks[0]?.type).toBe('button');
    expect(typeof newBlocks[0]?.id).toBe('string');
    expect(newBlocks[0]?.id.length).toBeGreaterThan(0);
  });

  it('I4: removing a block asks for confirmation first, then removes only that block', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    render(<BlockList blocks={[block('a'), block('b')]} blockTypes={BLOCK_TYPES} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove block' })[0] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([block('b')]);
  });

  it('I4: declining the removal confirmation makes no change', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChange = vi.fn();
    render(<BlockList blocks={[block('a')]} blockTypes={BLOCK_TYPES} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove block' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('I4: a block whose type accepts nested blocks renders its own nested BlockList', () => {
    render(
      <BlockList
        blocks={[{ id: 'g1', type: 'group', settings: {}, blocks: [block('nested')] }]}
        blockTypes={BLOCK_TYPES}
        onChange={vi.fn()}
      />,
    );

    // Two "Block type" selects: the outer add-menu and the nested one.
    expect(screen.getAllByLabelText('Block type')).toHaveLength(2);
  });

  it('I4: a block whose type does not accept nested blocks shows no nested block controls', () => {
    render(<BlockList blocks={[block('a')]} blockTypes={BLOCK_TYPES} onChange={vi.fn()} />);

    // Only the one top-level add-menu - no nested one for the button block.
    expect(screen.getAllByLabelText('Block type')).toHaveLength(1);
  });

  it('I5: a fieldErrors entry keyed by block id reaches that block\'s own settings form', () => {
    render(
      <BlockList
        blocks={[block('a')]}
        blockTypes={BLOCK_TYPES}
        fieldErrors={{ a: { label: 'must be a string' } }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('must be a string')).toBeDefined();
  });

  it('I6: editing a block\'s settings calls the same onChange - one save path, not a parallel one', () => {
    const onChange = vi.fn();
    render(<BlockList blocks={[block('a')]} blockTypes={BLOCK_TYPES} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('label'), { target: { value: 'Changed' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([{ id: 'a', type: 'button', settings: { label: 'Changed' } }]);
  });
});
