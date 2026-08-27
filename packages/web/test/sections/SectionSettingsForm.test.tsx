import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SectionSettingsForm } from '../../src/sections/SectionSettingsForm.tsx';

afterEach(() => {
  cleanup();
});

const HERO_SCHEMA = {
  type: 'object',
  required: ['heading'],
  properties: {
    heading: { type: 'string', minLength: 1 },
    columns: { type: 'integer', minimum: 1, maximum: 4 },
  },
};

describe('SectionSettingsForm', () => {
  it('I3: renders one field per settings-schema property, bound to the current values', () => {
    render(
      <SectionSettingsForm siteId="site-1" schema={HERO_SCHEMA} settings={{ heading: 'Hi', columns: 2 }} onChange={vi.fn()} />,
    );

    expect((screen.getByLabelText('Heading') as HTMLInputElement).value).toBe('Hi');
    expect((screen.getByLabelText('Columns') as HTMLInputElement).value).toBe('2');
  });

  it('humanises a camelCase property name into a Title Case label when the schema declares no title', () => {
    render(
      <SectionSettingsForm
        siteId="site-1"
        schema={{ type: 'object', properties: { codeTitle: { type: 'string' }, posterImage: { type: 'object' } } }}
        settings={{ codeTitle: '', posterImage: {} }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Code Title')).toBeDefined();
    expect(screen.getByLabelText('Poster Image')).toBeDefined();
  });

  it('prefers an explicit schema-declared title over the humanised property name', () => {
    render(
      <SectionSettingsForm
        siteId="site-1"
        schema={{ type: 'object', properties: { ctaUrl: { type: 'string', title: 'Button link' } } }}
        settings={{ ctaUrl: '' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Button link')).toBeDefined();
    expect(screen.queryByLabelText('Cta Url')).toBeNull();
  });

  it('I3: editing a field calls onChange with the settings object updated at just that key', () => {
    const onChange = vi.fn();
    render(<SectionSettingsForm siteId="site-1" schema={HERO_SCHEMA} settings={{ heading: 'Hi', columns: 2 }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Heading'), { target: { value: 'Updated' } });

    expect(onChange).toHaveBeenCalledWith({ heading: 'Updated', columns: 2 });
  });

  it('I5: a fieldErrors entry surfaces against the specific field, not a generic banner', () => {
    render(
      <SectionSettingsForm
        siteId="site-1"
        schema={HERO_SCHEMA}
        settings={{ heading: '', columns: 2 }}
        onChange={vi.fn()}
        fieldErrors={{ heading: 'must NOT have fewer than 1 characters' }}
      />,
    );

    expect(screen.getByText('must NOT have fewer than 1 characters')).toBeDefined();
    // Only the heading field's own error shows - not attached to columns.
    const columnsField = screen.getByLabelText('Columns').closest('label');
    expect(columnsField?.textContent?.includes('must NOT have')).toBe(false);
  });

  it('an object-shaped field (format: "image") still whole-object-replaces on change, preserving sibling fields', () => {
    const onChange = vi.fn();
    const schema = {
      type: 'object',
      properties: {
        heading: { type: 'string' },
        poster: { type: 'object', format: 'image' },
      },
    };
    render(
      <SectionSettingsForm
        siteId="site-1"
        schema={schema}
        settings={{ heading: 'Hi', poster: { url: 'https://example.com/a.jpg', focalX: 0.5, focalY: 0.5 } }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Poster'), { target: { value: 'https://example.com/b.jpg' } });

    expect(onChange).toHaveBeenCalledWith({
      heading: 'Hi',
      poster: { url: 'https://example.com/b.jpg', focalX: 0.5, focalY: 0.5 },
    });
  });

  it('a fieldErrors entry for a property the schema no longer declares shows as its own field-shaped row, humanised label included', () => {
    render(
      <SectionSettingsForm
        siteId="site-1"
        schema={HERO_SCHEMA}
        settings={{ heading: 'Hi', columns: 2, radioField: 'left' }}
        onChange={vi.fn()}
        fieldErrors={{ radioField: 'This field is no longer used by the current theme.' }}
      />,
    );

    const alert = screen.getByRole('alert');
    // Humanised the same way every other field's label falls back when
    // the schema gives it no title (fieldLabel/humanizeFieldKey) - not
    // the raw camelCase property name.
    expect(alert.textContent).toContain('Radio Field');
    expect(alert.textContent).not.toContain('radioField');
    expect(alert.textContent).toContain('This field is no longer used by the current theme.');
    // It's a row of its own, not a SchemaField - no editable input was created for it.
    expect(screen.queryByRole('textbox', { name: /radio field/i })).toBeNull();
  });

  it('the row\'s Remove button strips just that key, leaving every other setting untouched', () => {
    const onChange = vi.fn();
    render(
      <SectionSettingsForm
        siteId="site-1"
        schema={HERO_SCHEMA}
        settings={{ heading: 'Hi', columns: 2, radioField: 'left' }}
        onChange={onChange}
        fieldErrors={{ radioField: 'This field is no longer used by the current theme.' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Radio Field' }));

    expect(onChange).toHaveBeenCalledWith({ heading: 'Hi', columns: 2 });
  });

  it('falls back to raw settings editing for an unknown type, without discarding the instance', () => {
    const onChange = vi.fn();
    render(<SectionSettingsForm siteId="site-1" schema={undefined} settings={{ legacy: true }} onChange={onChange} />);

    expect(screen.getByText('Unknown type - editing raw settings.')).toBeDefined();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"legacy":false}' } });
    expect(onChange).toHaveBeenCalledWith({ legacy: false });
  });
});
