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
      <SectionSettingsForm schema={HERO_SCHEMA} settings={{ heading: 'Hi', columns: 2 }} onChange={vi.fn()} />,
    );

    expect((screen.getByLabelText('heading') as HTMLInputElement).value).toBe('Hi');
    expect((screen.getByLabelText('columns') as HTMLInputElement).value).toBe('2');
  });

  it('I3: editing a field calls onChange with the settings object updated at just that key', () => {
    const onChange = vi.fn();
    render(<SectionSettingsForm schema={HERO_SCHEMA} settings={{ heading: 'Hi', columns: 2 }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('heading'), { target: { value: 'Updated' } });

    expect(onChange).toHaveBeenCalledWith({ heading: 'Updated', columns: 2 });
  });

  it('I5: a fieldErrors entry surfaces against the specific field, not a generic banner', () => {
    render(
      <SectionSettingsForm
        schema={HERO_SCHEMA}
        settings={{ heading: '', columns: 2 }}
        onChange={vi.fn()}
        fieldErrors={{ heading: 'must NOT have fewer than 1 characters' }}
      />,
    );

    expect(screen.getByText('must NOT have fewer than 1 characters')).toBeDefined();
    // Only the heading field's own error shows - not attached to columns.
    const columnsField = screen.getByLabelText('columns').closest('label');
    expect(columnsField?.textContent?.includes('must NOT have')).toBe(false);
  });

  it('falls back to raw settings editing for an unknown type, without discarding the instance', () => {
    const onChange = vi.fn();
    render(<SectionSettingsForm schema={undefined} settings={{ legacy: true }} onChange={onChange} />);

    expect(screen.getByText('Unknown type - editing raw settings.')).toBeDefined();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"legacy":false}' } });
    expect(onChange).toHaveBeenCalledWith({ legacy: false });
  });
});
