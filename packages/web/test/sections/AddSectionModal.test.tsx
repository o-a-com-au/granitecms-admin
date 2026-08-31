import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AddSectionModal } from '../../src/sections/AddSectionModal.tsx';
import type { ThemeTypeSchemas } from '../../src/sections/instance-types.ts';

afterEach(() => {
  cleanup();
});

const SECTION_TYPES: ThemeTypeSchemas = {
  schemas: {
    hero: { type: 'object', properties: {} },
    faq: { type: 'object', title: 'FAQ', properties: {} },
  },
  acceptsBlocks: { hero: true, faq: false },
};

function cards(): HTMLElement[] {
  return within(screen.getByRole('dialog', { name: 'Add a Section' }))
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-label') !== 'Close');
}

describe('AddSectionModal', () => {
  it('renders one card per section type, using the schema\'s own title when it declares one', () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(cards().map((card) => card.textContent)).toEqual(['hero', 'FAQ']);
  });

  it('clicking a card calls onSelect with that type', () => {
    const onSelect = vi.fn();
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));

    expect(onSelect).toHaveBeenCalledWith('faq');
  });

  it('Close calls onClose without calling onSelect', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
