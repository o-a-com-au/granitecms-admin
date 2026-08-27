import { useId, useState } from 'react';
import { ColorField } from './ColorField.tsx';
import { ImageField } from './ImageField.tsx';
import { RangeField } from './RangeField.tsx';
import { RichTextField } from './RichTextField.tsx';

export interface SchemaFieldProps {
  siteId: string;
  label: string;
  schema: Record<string, unknown>;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}

function isEnumSchema(schema: Record<string, unknown>): schema is Record<string, unknown> & { enum: unknown[] } {
  return Array.isArray(schema.enum);
}

// Mirrors Shopify's own range setting: minimum/maximum are required
// (reusing the standard JSON Schema keywords the plain number branch
// already reads, not a new pair of custom ones), step/unit are not.
// Missing either bound is a theme-authoring mistake, not something to
// guess a fallback for - falls through to the plain number input
// instead, same convention as every other mismatched format above.
function isRangeSchema(
  schema: Record<string, unknown>,
): schema is Record<string, unknown> & { minimum: number; maximum: number } {
  return typeof schema.minimum === 'number' && typeof schema.maximum === 'number';
}

// "swatches" is a plain array of hex strings, deliberately not real
// JSON Schema (no keyword validates its shape) - same tolerance the
// theme's own "allowedBlocks" already relies on. A malformed value
// (not an array, or an array with non-string entries) degrades to no
// swatches rather than throwing - still a working colour field, just
// without the shortcut.
function colorSwatches(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
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
// plain jsdiff over a diff-viewer library in Group H). format also
// picks a richer widget for textarea/uri/date/color strings, for
// radio (an enum rendered as radio buttons instead of a <select>), and
// for range (a number with both minimum and maximum, rendered as a
// slider plus a number box) - all six are UI hints only, same as
// richtext/image: ajv runs with strict:false and no ajv-formats, so
// none of these are validated server-side, and a theme author who
// needs real validation still has pattern/minLength/etc. available.
export function SchemaField({ siteId, label, schema, value, onChange, error }: SchemaFieldProps) {
  const type = typeof schema.type === 'string' ? schema.type : undefined;
  const format = typeof schema.format === 'string' ? schema.format : undefined;
  const isRadio = format === 'radio' && isEnumSchema(schema);
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
    control = <ImageField siteId={siteId} value={value} onChange={onChange} />;
  } else if (format === 'color' && type === 'string') {
    // Checked ahead of isRadio/isEnumSchema below: a colour field may
    // declare its own "swatches" (a plain array of hex strings, not
    // "enum" - see ColorField's own comment for why) alongside enum
    // for something else entirely, or no enum at all. Either way this
    // branch must win before the generic enum-shaped branches get a
    // chance to treat it as a select/radio.
    control = <ColorField value={value} swatches={colorSwatches(schema.swatches)} onChange={onChange} />;
  } else if (isRadio) {
    control = (
      <div role="radiogroup" aria-labelledby={fieldId} className="schema-field-radiogroup">
        {schema.enum.map((option) => {
          const optionValue = String(option);
          return (
            <label key={optionValue} className="schema-field-radio-option">
              <input
                type="radio"
                name={fieldId}
                value={optionValue}
                checked={String(value ?? '') === optionValue}
                onChange={() => onChange(coerceEnumValue(schema.enum, optionValue))}
              />
              {optionValue}
            </label>
          );
        })}
      </div>
    );
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
  } else if (format === 'range' && (type === 'integer' || type === 'number') && isRangeSchema(schema)) {
    control = (
      <RangeField
        value={value}
        minimum={schema.minimum}
        maximum={schema.maximum}
        step={typeof schema.step === 'number' ? schema.step : 1}
        unit={typeof schema.unit === 'string' ? schema.unit : undefined}
        onChange={onChange}
      />
    );
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
  } else if (format === 'textarea' && type === 'string') {
    control = (
      <textarea
        minLength={typeof schema.minLength === 'number' ? schema.minLength : undefined}
        maxLength={typeof schema.maxLength === 'number' ? schema.maxLength : undefined}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else if (format === 'uri' && type === 'string') {
    control = (
      <input
        type="url"
        minLength={typeof schema.minLength === 'number' ? schema.minLength : undefined}
        maxLength={typeof schema.maxLength === 'number' ? schema.maxLength : undefined}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else if (format === 'date' && type === 'string') {
    control = <input type="date" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />;
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

  // richtext gets a plain <div>, not a native <label> - a bare <label>
  // implicitly redirects a click on any non-"labelable" descendant (a
  // contentEditable div is not one, per the HTML spec's own labelable-
  // elements list: button/input/select/textarea/meter/output/progress
  // only) to its first labelable descendant instead. RichTextField's
  // toolbar puts a real <button> first, so every click anywhere in the
  // editor - meant to place the cursor or start a text selection - was
  // being silently redirected into a synthetic click on that button,
  // which (for the format dropdown specifically) toggled it open and
  // stole focus, making it impossible to select text at all. Confirmed
  // live: even clicking the plain "Body" label text alone reproduced
  // it. RichTextField already sets aria-labelledby on its own editor
  // element, so it doesn't need the native label association here -
  // every other field type still does, and keeps the <label> wrapper.
  // Radio shares the same reasoning for a different cause: it renders
  // several of its own <label> elements (one per option, each properly
  // associated with its own <input>), and a native <label> cannot
  // nest inside another - the group's own aria-labelledby (set on its
  // role="radiogroup" div above) covers the association instead.
  const isCompoundField = (format === 'richtext' && type === 'string') || isRadio;
  const Wrapper = isCompoundField ? 'div' : 'label';

  // base.css styles every plain <label> (layout, muted colour,
  // font-size) via a bare `label` element selector - harmless for
  // every other field type here, which still renders a real <label>,
  // but the richtext <div> above needs that same look applied
  // explicitly via a class, or its own "Body"-style caption reads
  // differently from every other field's.
  return (
    <Wrapper className="schema-field-label">
      <span id={fieldId}>{label}</span>
      {control}
      {error && <p role="alert">{error}</p>}
    </Wrapper>
  );
}
