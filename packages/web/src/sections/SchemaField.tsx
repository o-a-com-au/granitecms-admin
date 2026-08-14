import { useId, useState } from 'react';
import { ImageField } from './ImageField.tsx';
import { RichTextField } from './RichTextField.tsx';

export interface SchemaFieldProps {
  label: string;
  schema: Record<string, unknown>;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

function isEnumSchema(schema: Record<string, unknown>): schema is Record<string, unknown> & { enum: unknown[] } {
  return Array.isArray(schema.enum);
}

// Native <select> values are always strings - map back to whichever
// original enum entry stringifies to the selected one, so a non-
// string enum (not seen in any real theme file today, but ajv itself
// doesn't forbid it) still round-trips to its real type.
function coerceEnumValue(enumValues: unknown[], selected: string): unknown {
  return enumValues.find((entry) => String(entry) === selected) ?? selected;
}

// I3: an invalid settings shape (object/array, or a schema this
// mapper doesn't otherwise recognise) falls back to a per-field raw
// JSON textarea rather than silently dropping the field - it stays
// editable either way, just without a dedicated widget. Local text is
// buffered so invalid-JSON-in-progress typing never calls onChange
// with something unparseable (same principle as the whole-document
// textarea's own invalidJson handling elsewhere in this app).
function RawJsonFallback({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);

  function handleChange(next: string): void {
    setText(next);
    try {
      const parsed = JSON.parse(next) as unknown;
      setInvalid(false);
      onChange(parsed);
    } catch {
      setInvalid(true);
    }
  }

  return (
    <>
      <textarea value={text} onChange={(event) => handleChange(event.target.value)} />
      {invalid && <p role="alert">Not valid JSON yet - not saved.</p>}
    </>
  );
}

// I3: maps one settings-schema property to an appropriate input -
// enum -> select, string -> text, integer/number -> number, boolean
// -> checkbox, anything else -> the raw-JSON fallback above. A small
// custom mapper, not a JSON-Schema-form library: the schema surface
// here is narrow and flat (confirmed against every real theme file in
// this project), so a library would be heavier than the problem
// warrants - matching this project's consistent preference for the
// simplest mechanism that actually works (same reasoning as choosing
// plain jsdiff over a diff-viewer library in Group H).
export function SchemaField({ label, schema, value, onChange, error }: SchemaFieldProps) {
  const type = typeof schema.type === 'string' ? schema.type : undefined;
  const format = typeof schema.format === 'string' ? schema.format : undefined;
  const fieldId = useId();

  let control: React.ReactNode;

  // format checked ahead of the plain type-based branches below - a
  // mismatched pair (e.g. format: 'image' on a non-object schema) is a
  // theme-authoring mistake, not something to guess around, so it
  // deliberately falls through to the existing chain unchanged rather
  // than being special-cased further.
  if (format === 'richtext' && type === 'string') {
    control = (
      <RichTextField value={typeof value === 'string' ? value : ''} onChange={onChange} labelledBy={fieldId} />
    );
  } else if (format === 'image' && type === 'object') {
    control = <ImageField value={value} onChange={onChange} />;
  } else if (isEnumSchema(schema)) {
    control = (
      <select value={String(value ?? '')} onChange={(event) => onChange(coerceEnumValue(schema.enum, event.target.value))}>
        {schema.enum.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  } else if (type === 'boolean') {
    control = <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;
  } else if (type === 'integer' || type === 'number') {
    control = (
      <input
        type="number"
        step={type === 'integer' ? 1 : 'any'}
        min={typeof schema.minimum === 'number' ? schema.minimum : undefined}
        max={typeof schema.maximum === 'number' ? schema.maximum : undefined}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            return;
          }
          const parsed = type === 'integer' ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
          if (!Number.isNaN(parsed)) {
            onChange(parsed);
          }
        }}
      />
    );
  } else if (type === 'string') {
    control = (
      <input
        type="text"
        minLength={typeof schema.minLength === 'number' ? schema.minLength : undefined}
        maxLength={typeof schema.maxLength === 'number' ? schema.maxLength : undefined}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else {
    control = <RawJsonFallback value={value} onChange={onChange} />;
  }

  return (
    <label>
      <span id={fieldId}>{label}</span>
      {control}
      {error && <p role="alert">{error}</p>}
    </label>
  );
}
