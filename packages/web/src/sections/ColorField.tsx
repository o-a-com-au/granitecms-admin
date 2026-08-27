import { useEffect, useState } from 'react';

export interface ColorFieldProps {
  value: unknown;
  swatches: string[];
  onChange: (value: string) => void;
}

// Accepts with or without a leading #, 3- or 6-digit, either case -
// normalized to a lowercase #rrggbb, the one strict shape the native
// <input type="color"> itself will accept as a value. Returns null for
// anything else (an in-progress or genuinely invalid string) rather
// than guessing - the caller decides what to do with that.
function normalizeHex(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed
      .toLowerCase()
      .split('')
      .map((digit) => digit + digit)
      .join('')}`;
  }
  return null;
}

// The native <input type="color"> stays the source of truth and the
// only way to enter something not in the swatch list - swatches are a
// fast path onto the exact same onChange, never a separate, restricted
// mode. This is why the theme's own "swatches" keyword (SchemaField's
// format: "color" branch) is deliberately not "enum": an enum is a
// real, Ajv-enforced constraint, which would reject a genuinely custom
// colour outright - swatches are only ever a suggestion.
export function ColorField({ value, swatches, onChange }: ColorFieldProps) {
  const hasValue = typeof value === 'string' && value !== '';
  const current = hasValue ? (value as string) : '#000000';
  // A browser's native colour-picker popup (opened by clicking the
  // swatch) can't be styled or added to via any web API - this text
  // input is the practical equivalent, a normal sibling control, not
  // something injected into that native popup. Buffers local text and
  // only commits (normalizing via normalizeHex) on blur/Enter, the
  // same "let them finish typing" pattern RangeField's own number box
  // uses - committing on every keystroke would make it impossible to
  // type a full 6-digit hex without each partial prefix along the way
  // being rejected as invalid.
  const [hexText, setHexText] = useState(current);

  useEffect(() => {
    setHexText(current);
  }, [current]);

  function commitHexText(raw: string): void {
    if (raw.trim() === '') {
      onChange('');
      return;
    }
    const normalized = normalizeHex(raw);
    if (normalized === null) {
      setHexText(current);
      return;
    }
    onChange(normalized);
  }

  return (
    <div className="colour-field">
      {swatches.length > 0 && (
        <div className="colour-field-swatches" role="group" aria-label="Preset colours">
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className="colour-field-swatch"
              style={{ backgroundColor: swatch }}
              aria-label={swatch}
              aria-pressed={current.toLowerCase() === swatch.toLowerCase()}
              onClick={() => onChange(swatch)}
            />
          ))}
        </div>
      )}
      <div className="colour-field-input-row">
        <input type="color" value={current} onChange={(event) => onChange(event.target.value)} />
        <input
          type="text"
          className="colour-field-hex-input"
          value={hexText}
          placeholder="#000000"
          spellCheck={false}
          onChange={(event) => setHexText(event.target.value)}
          onBlur={(event) => commitHexText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitHexText(event.currentTarget.value);
            }
          }}
        />
        {/* The native input can never itself be blank (browsers coerce
            an empty value to black), so clearing back to "no colour
            set" needs its own explicit action - same gap ImageField
            had before its own Remove button. */}
        {hasValue && (
          <button type="button" className="colour-field-clear" onClick={() => onChange('')}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
