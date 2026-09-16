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
    'media-text': { type: 'object', title: 'Media + Text', properties: {} },
  },
  acceptsBlocks: { hero: true, faq: false, 'media-text': false },
};

function rows(): HTMLElement[] {
  return within(screen.getByRole('dialog', { name: 'Add a Section' }))
    .getAllByRole('button')
    .filter((button) => !['Close', 'Clear search'].includes(button.getAttribute('aria-label') ?? ''))
    // Cancel/Add live in the footer, not the list - they are buttons in
    // the same dialog but are not rows.
    .filter((button) => !['Cancel', 'Add'].includes(button.textContent ?? ''));
}

describe('AddSectionModal', () => {
  it('renders one row per section type, using the schema\'s own title when it declares one', () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(rows().map((row) => row.textContent)).toEqual(['hero', 'FAQ', 'Media + Text']);
  });

  it('the search bar filters the list by the displayed title, case-insensitively', () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search sections'), { target: { value: 'MEDIA' } });

    expect(rows().map((row) => row.textContent)).toEqual(['Media + Text']);
  });

  it('a query matching nothing shows an empty message instead of a blank list', () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Search sections'), { target: { value: 'nonexistent' } });

    expect(rows()).toHaveLength(0);
    expect(screen.getByText('No sections match "nonexistent".')).toBeDefined();
  });

  it('clearing the search query restores every row', () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={vi.fn()} onClose={vi.fn()} />);

    const search = screen.getByPlaceholderText('Search sections');
    fireEvent.change(search, { target: { value: 'FAQ' } });
    expect(rows()).toHaveLength(1);

    fireEvent.change(search, { target: { value: '' } });
    expect(rows()).toHaveLength(3);
  });

  it('clicking a row selects it without adding anything yet', () => {
    const onSelect = vi.fn();
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));

    // Selection is carried by aria-pressed, which is also what the blue
    // keyline is styled from.
    expect(screen.getByRole('button', { name: 'FAQ' }).getAttribute('aria-pressed')).toBe('true');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Add applies the selected row, and is disabled until one is chosen', () => {
    const onSelect = vi.fn();
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={onSelect} onClose={vi.fn()} />);

    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
    expect(add.disabled).toBe(false);
    fireEvent.click(add);

    expect(onSelect).toHaveBeenCalledWith('faq');
  });

  it('selecting another row replaces the first, never selecting two at once', () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Media + Text' }));

    expect(rows().filter((row) => row.getAttribute('aria-pressed') === 'true').map((row) => row.getAttribute('aria-label'))).toEqual([
      'Media + Text',
    ]);
  });

  it('a selection filtered out of view stops counting, so Add cannot insert something unseen', () => {
    const onSelect = vi.fn();
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={onSelect} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
    fireEvent.change(screen.getByPlaceholderText('Search sections'), { target: { value: 'media' } });

    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);

    // Clearing the query brings the row, and its selection, back.
    fireEvent.change(screen.getByPlaceholderText('Search sections'), { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Cancel calls onClose without adding anything', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Close calls onClose without calling onSelect', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<AddSectionModal sectionTypes={SECTION_TYPES} onSelect={onSelect} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Only these two declare the optional keywords - "hero" deliberately
  // declares neither, so one fixture covers both the present and the
  // absent case.
  const SECTION_TYPES_WITH_META: ThemeTypeSchemas = {
    schemas: {
      hero: { type: 'object', properties: {} },
      quote: {
        type: 'object',
        title: 'Quote',
        description: 'Give special visual emphasis to a quote from your text.',
        icon: 'quote',
        properties: {},
      },
    },
    acceptsBlocks: { hero: false, quote: false },
  };

  it("shows the schema's own description, and nothing at all when it declares none", () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES_WITH_META} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('Give special visual emphasis to a quote from your text.')).toBeDefined();

    const heroRow = screen.getByRole('button', { name: 'hero' });
    expect(heroRow.querySelector('.add-section-item-description')).toBeNull();
  });

  it("keeps a row's accessible name to its title, with the description exposed separately", () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES_WITH_META} onSelect={vi.fn()} onClose={vi.fn()} />);

    // Without the explicit aria-label this name would be the title and
    // the description run together, breaking every by-name query.
    const quoteRow = screen.getByRole('button', { name: 'Quote' });
    const describedBy = quoteRow.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      'Give special visual emphasis to a quote from your text.',
    );
  });

  it('picks an icon from words in the name when the schema declares none', () => {
    const named: ThemeTypeSchemas = {
      schemas: {
        quote: { type: 'object', title: 'Quote', properties: {} },
        gallery: { type: 'object', title: 'Gallery', properties: {} },
        contact: { type: 'object', title: 'Contact', properties: {} },
        unmatched: { type: 'object', title: 'Massing model', properties: {} },
      },
      acceptsBlocks: { quote: false, gallery: false, contact: false, unmatched: false },
    };
    render(<AddSectionModal sectionTypes={named} onSelect={vi.fn()} onClose={vi.fn()} />);

    const iconOf = (name: string) =>
      screen.getByRole('button', { name }).querySelector('.add-section-item-icon svg')?.getAttribute('data-icon');

    expect(iconOf('Quote')).toBe('quote');
    expect(iconOf('Gallery')).toBe('layout-panel-top');
    expect(iconOf('Contact')).toBe('form');
    // No rule matches this one, so it lands on the shared default
    // rather than on nothing at all.
    expect(iconOf('Massing model')).toBe('layout-template');
  });

  it("a theme's own icon keyword beats what the name would have guessed", () => {
    const named: ThemeTypeSchemas = {
      // "Quote" would infer the quote icon; the explicit keyword must win.
      schemas: { quote: { type: 'object', title: 'Quote', icon: 'star', properties: {} } },
      acceptsBlocks: { quote: false },
    };
    render(<AddSectionModal sectionTypes={named} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Quote' }).querySelector('.add-section-item-icon svg')?.getAttribute('data-icon'),
    ).toBe('star');
  });

  it('renders an icon on every row, including one whose schema names none', () => {
    render(<AddSectionModal sectionTypes={SECTION_TYPES_WITH_META} onSelect={vi.fn()} onClose={vi.fn()} />);

    for (const row of rows()) {
      expect(row.querySelector('.add-section-item-icon svg')).not.toBeNull();
    }
  });
});
