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

  it('a settings property the schema no longer declares is never shown - nothing here references it or its error', () => {
    render(
      <SectionSettingsForm
        siteId="site-1"
        schema={HERO_SCHEMA}
        settings={{ heading: 'Hi', columns: 2, radioField: 'left' }}
        onChange={vi.fn()}
        fieldErrors={{ radioField: 'This field is no longer used by the current theme.' }}
      />,
    );

    // A content editor is never shown anything about it - no callout,
    // no alert, nothing referencing the stale property or its error.
    // Cleaning it out of settings is page-content.ts's stripUnknownSettings'
    // job (called once per page-wide edit, not per field here) - this
    // component only ever renders what the schema still declares.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/radioField|radio field/i)).toBeNull();
  });

  it('falls back to raw settings editing for an unknown type, without discarding the instance', () => {
    const onChange = vi.fn();
    render(<SectionSettingsForm siteId="site-1" schema={undefined} settings={{ legacy: true }} onChange={onChange} />);

    expect(screen.getByText('Unknown type - editing raw settings.')).toBeDefined();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"legacy":false}' } });
    expect(onChange).toHaveBeenCalledWith({ legacy: false });
  });
  const GROUPED_SCHEMA = {
    type: 'object',
    properties: {
      site_name: { type: 'string', title: 'Site name' },
      github_url: { type: 'string', title: 'GitHub link', group: 'Social links' },
      headline_font: { type: 'string', title: 'Headline font', enum: ['Serif', 'Sans-serif'], group: 'Typography' },
      x_url: { type: 'string', title: 'X link', group: 'Social links' },
    },
  };

  it('puts fields with a "group" in accordions: ungrouped first, groups in schema order, the first open', () => {
    render(<SectionSettingsForm siteId="site-1" schema={GROUPED_SCHEMA} settings={{}} onChange={vi.fn()} />);

    const rows = screen.getAllByRole('button', { expanded: true }).concat(screen.getAllByRole('button', { expanded: false }));
    expect(rows.map((row) => row.textContent)).toEqual(['Social links', 'Typography']);
    expect(screen.getByLabelText('Site name')).toBeDefined();
    expect(screen.getByLabelText('GitHub link')).toBeDefined();
    expect(screen.getByLabelText('X link')).toBeDefined();
    expect(screen.queryByLabelText('Headline font')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
    expect(screen.getByLabelText('Headline font')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Social links' }));
    expect(screen.queryByLabelText('GitHub link')).toBeNull();
  });

  it('opens a closed group holding a field with an error, so the error is seen', () => {
    render(
      <SectionSettingsForm siteId="site-1" schema={GROUPED_SCHEMA} settings={{}} onChange={vi.fn()} fieldErrors={{ headline_font: 'Pick one' }} />,
    );
    expect(screen.getByRole('button', { name: 'Typography' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Headline font')).toBeDefined();
  });

  it('opens the group a link names (by its slug) instead of the first', () => {
    render(<SectionSettingsForm siteId="site-1" schema={GROUPED_SCHEMA} settings={{}} onChange={vi.fn()} initialGroup="typography" />);
    expect(screen.getByRole('button', { name: 'Typography' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Social links' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('a schema with no groups stays a plain list, with no accordion rows', () => {
    render(<SectionSettingsForm siteId="site-1" schema={HERO_SCHEMA} settings={{}} onChange={vi.fn()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
