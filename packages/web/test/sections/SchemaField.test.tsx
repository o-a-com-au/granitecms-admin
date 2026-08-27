import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SchemaField } from '../../src/sections/SchemaField.tsx';

afterEach(() => {
  cleanup();
});

describe('SchemaField', () => {
  // Real fixture schema: fixtures/demo-site/theme/blocks/button.liquid's
  // style field - 3 short options, so SelectField auto-picks tabs over
  // a <select> (SelectField.test.tsx covers the decision logic itself
  // in full; this just confirms SchemaField actually wires enum to it).
  it('I3: renders an enum field via SelectField, sourced from the real button.style schema', () => {
    const onChange = vi.fn();
    render(
      <SchemaField
        siteId="site-1"
        label="Style"
        schema={{ type: 'string', enum: ['primary', 'secondary', 'on-dark'] }}
        value="primary"
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'on-dark' }));
    expect(onChange).toHaveBeenCalledWith('on-dark');
  });

  // Real fixture schema: fixtures/demo-site/theme/blocks/pricing-tier.liquid's highlighted field.
  it('I3: renders a checkbox for a boolean field', () => {
    const onChange = vi.fn();
    render(<SchemaField siteId="site-1" label="Highlighted" schema={{ type: 'boolean' }} value={true} onChange={onChange} />);

    const checkbox = screen.getByLabelText('Highlighted') as HTMLInputElement;
    expect(checkbox.type).toBe('checkbox');
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders ToggleField for a boolean with format: "toggle" instead of a plain checkbox', () => {
    const onChange = vi.fn();
    render(<SchemaField siteId="site-1" label="Enabled" schema={{ type: 'boolean', format: 'toggle' }} value={false} onChange={onChange} />);

    expect(document.querySelector('.toggle-field')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Enabled'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a format: "toggle" schema on a non-boolean type falls through to the raw JSON fallback, not ToggleField', () => {
    render(<SchemaField siteId="site-1" label="Enabled" schema={{ type: 'string', format: 'toggle' }} value="x" onChange={vi.fn()} />);

    expect(document.querySelector('.toggle-field')).toBeNull();
    expect((screen.getByLabelText('Enabled') as HTMLInputElement).type).toBe('text');
  });

  it('I3: renders a text input for a string field, respecting minLength/maxLength', () => {
    const onChange = vi.fn();
    render(<SchemaField siteId="site-1" label="Heading" schema={{ type: 'string', minLength: 1 }} value="Hello" onChange={onChange} />);

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
        siteId="site-1"
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

  it('renders RangeField for a number with format: "range" plus minimum/maximum, not the plain number input', () => {
    render(
      <SchemaField
        siteId="site-1"
        label="Font size"
        schema={{ type: 'integer', format: 'range', minimum: 12, maximum: 24, step: 2, unit: 'px' }}
        value={16}
        onChange={vi.fn()}
      />,
    );

    expect(document.querySelector('input[type="range"]')).toBeDefined();
    expect(screen.getByText('px')).toBeDefined();
  });

  it('a format: "range" schema missing minimum/maximum falls through to the plain number input', () => {
    render(
      <SchemaField siteId="site-1" label="Font size" schema={{ type: 'integer', format: 'range' }} value={16} onChange={vi.fn()} />,
    );

    expect(document.querySelector('input[type="range"]')).toBeNull();
    expect((screen.getByLabelText('Font size') as HTMLInputElement).type).toBe('number');
  });

  it('I3: falls back to a raw JSON textarea for an unrecognised schema shape, never dropping the field', () => {
    const onChange = vi.fn();
    render(<SchemaField siteId="site-1" label="Extra" schema={{ type: 'object' }} value={{ nested: true }} onChange={onChange} />);

    const textarea = screen.getByLabelText('Extra') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    fireEvent.change(textarea, { target: { value: '{"nested":false}' } });
    expect(onChange).toHaveBeenCalledWith({ nested: false });
  });

  it('I3: an invalid-JSON edit in the raw fallback shows a message and never calls onChange', () => {
    const onChange = vi.fn();
    render(<SchemaField siteId="site-1" label="Extra" schema={{ type: 'object' }} value={{ nested: true }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Extra'), { target: { value: '{ not valid' } });

    expect(screen.getByText('Not valid JSON yet - not saved.')).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders RichTextField for format: "richtext" ahead of the plain string branch', () => {
    const onChange = vi.fn();
    render(
      <SchemaField siteId="site-1" label="Body" schema={{ type: 'string', format: 'richtext' }} value="<p>Hi</p>" onChange={onChange} />,
    );

    const editor = screen.getByLabelText('Body');
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(editor.innerHTML).toBe('<p>Hi</p>');
  });

  it('a format: "richtext" schema on a non-string type falls through to the raw JSON fallback, not RichTextField', () => {
    render(<SchemaField siteId="site-1" label="Body" schema={{ type: 'object', format: 'richtext' }} value={{}} onChange={vi.fn()} />);

    const field = screen.getByLabelText('Body');
    expect(field.tagName).toBe('TEXTAREA');
  });

  it('renders ImageField for format: "image" ahead of the raw JSON fallback', () => {
    const onChange = vi.fn();
    render(
      <SchemaField
        siteId="site-1"
        label="Poster"
        schema={{ type: 'object', format: 'image' }}
        value={{ url: 'https://example.com/a.jpg', focalX: 0.25, focalY: 0.75 }}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('Poster') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.value).toBe('https://example.com/a.jpg');
  });

  it('a format: "image" schema on a non-object type falls through to the plain text branch, not ImageField', () => {
    render(<SchemaField siteId="site-1" label="Poster" schema={{ type: 'string', format: 'image' }} value="x" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Poster') as HTMLInputElement;
    expect(input.type).toBe('text');
  });

  it('renders a <textarea> for format: "textarea", respecting minLength/maxLength', () => {
    const onChange = vi.fn();
    render(
      <SchemaField
        siteId="site-1"
        label="Bio"
        schema={{ type: 'string', format: 'textarea', maxLength: 500 }}
        value="Hello"
        onChange={onChange}
      />,
    );

    const textarea = screen.getByLabelText('Bio') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.maxLength).toBe(500);
    fireEvent.change(textarea, { target: { value: 'Updated' } });
    expect(onChange).toHaveBeenCalledWith('Updated');
  });

  it('renders an <input type="url"> for format: "uri"', () => {
    const onChange = vi.fn();
    render(
      <SchemaField
        siteId="site-1"
        label="Website"
        schema={{ type: 'string', format: 'uri' }}
        value="https://example.com"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('Website') as HTMLInputElement;
    expect(input.type).toBe('url');
    fireEvent.change(input, { target: { value: 'https://example.org' } });
    expect(onChange).toHaveBeenCalledWith('https://example.org');
  });

  it('renders an <input type="date"> for format: "date"', () => {
    const onChange = vi.fn();
    render(<SchemaField siteId="site-1" label="Published" schema={{ type: 'string', format: 'date' }} value="2026-08-26" onChange={onChange} />);

    const input = screen.getByLabelText('Published') as HTMLInputElement;
    expect(input.type).toBe('date');
    fireEvent.change(input, { target: { value: '2026-09-01' } });
    expect(onChange).toHaveBeenCalledWith('2026-09-01');
  });

  it('renders an <input type="color"> for format: "color", defaulting an absent value to black', () => {
    const onChange = vi.fn();
    render(<SchemaField siteId="site-1" label="Accent" schema={{ type: 'string', format: 'color' }} value={undefined} onChange={onChange} />);

    const input = screen.getByLabelText('Accent') as HTMLInputElement;
    expect(input.type).toBe('color');
    expect(input.value).toBe('#000000');
    fireEvent.change(input, { target: { value: '#ff6600' } });
    expect(onChange).toHaveBeenCalledWith('#ff6600');
  });

  it('a format: "color" field with both swatches and enum still renders ColorField, not a <select>', () => {
    const onChange = vi.fn();
    render(
      <SchemaField
        siteId="site-1"
        label="Accent"
        schema={{ type: 'string', format: 'color', swatches: ['#c2410c', '#1d4ed8'], enum: ['#c2410c', '#1d4ed8'] }}
        value="#c2410c"
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('group', { name: 'Preset colours' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '#1d4ed8' }));
    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('an enum with more than 3 options renders as a <select>, not tabs', () => {
    render(
      <SchemaField
        siteId="site-1"
        label="Size"
        schema={{ type: 'string', enum: ['xs', 'sm', 'md', 'lg'] }}
        value="sm"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Size').tagName).toBe('SELECT');
  });

  it('I5: shows a field-specific error message when one is passed, not a generic banner', () => {
    render(
      <SchemaField siteId="site-1" label="Heading" schema={{ type: 'string' }} value="" onChange={vi.fn()} error="must be at least 1 character" />,
    );

    expect(screen.getByText('must be at least 1 character')).toBeDefined();
  });
});
