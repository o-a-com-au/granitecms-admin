import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SchemaField } from '../../src/sections/SchemaField.tsx';

afterEach(() => {
  cleanup();
});

describe('SchemaField', () => {
  // Real fixture schema: fixtures/demo-site/theme/blocks/button.liquid's style field.
  it('I3: renders a <select> for an enum field, sourced from the real button.style schema', () => {
    const onChange = vi.fn();
    render(
      <SchemaField
        label="Style"
        schema={{ type: 'string', enum: ['primary', 'secondary', 'on-dark'] }}
        value="primary"
        onChange={onChange}
      />,
    );

    const select = screen.getByLabelText('Style') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    fireEvent.change(select, { target: { value: 'on-dark' } });
    expect(onChange).toHaveBeenCalledWith('on-dark');
  });

  // Real fixture schema: fixtures/demo-site/theme/blocks/pricing-tier.liquid's highlighted field.
  it('I3: renders a checkbox for a boolean field', () => {
    const onChange = vi.fn();
    render(<SchemaField label="Highlighted" schema={{ type: 'boolean' }} value={true} onChange={onChange} />);

    const checkbox = screen.getByLabelText('Highlighted') as HTMLInputElement;
    expect(checkbox.type).toBe('checkbox');
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('I3: renders a text input for a string field, respecting minLength/maxLength', () => {
    const onChange = vi.fn();
    render(<SchemaField label="Heading" schema={{ type: 'string', minLength: 1 }} value="Hello" onChange={onChange} />);

    const input = screen.getByLabelText('Heading') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.minLength).toBe(1);
    fireEvent.change(input, { target: { value: 'Updated' } });
    expect(onChange).toHaveBeenCalledWith('Updated');
  });

  it('I3: renders a number input for an integer field, respecting minimum/maximum', () => {
    const onChange = vi.fn();
    render(
      <SchemaField
        label="Columns"
        schema={{ type: 'integer', minimum: 1, maximum: 4 }}
        value={2}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('Columns') as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.min).toBe('1');
    expect(input.max).toBe('4');
    fireEvent.change(input, { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('I3: falls back to a raw JSON textarea for an unrecognised schema shape, never dropping the field', () => {
    const onChange = vi.fn();
    render(<SchemaField label="Extra" schema={{ type: 'object' }} value={{ nested: true }} onChange={onChange} />);

    const textarea = screen.getByLabelText('Extra') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    fireEvent.change(textarea, { target: { value: '{"nested":false}' } });
    expect(onChange).toHaveBeenCalledWith({ nested: false });
  });

  it('I3: an invalid-JSON edit in the raw fallback shows a message and never calls onChange', () => {
    const onChange = vi.fn();
    render(<SchemaField label="Extra" schema={{ type: 'object' }} value={{ nested: true }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Extra'), { target: { value: '{ not valid' } });

    expect(screen.getByText('Not valid JSON yet - not saved.')).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('I5: shows a field-specific error message when one is passed, not a generic banner', () => {
    render(
      <SchemaField label="Heading" schema={{ type: 'string' }} value="" onChange={vi.fn()} error="must be at least 1 character" />,
    );

    expect(screen.getByText('must be at least 1 character')).toBeDefined();
  });
});
