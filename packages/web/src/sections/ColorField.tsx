export interface ColorFieldProps {
  value: unknown;
  swatches: string[];
  onChange: (value: string) => void;
}

// The native <input type="color"> stays the source of truth and the
// only way to enter something not in the list - swatches are a fast
// path onto the exact same onChange, never a separate, restricted
// mode. This is why the theme's own "swatches" keyword (SchemaField's
// format: "color" branch) is deliberately not "enum": an enum is a
// real, Ajv-enforced constraint, which would reject a genuinely custom
// colour outright - swatches are only ever a suggestion.
export function ColorField({ value, swatches, onChange }: ColorFieldProps) {
  const hasValue = typeof value === 'string' && value !== '';
  const current = hasValue ? (value as string) : '#000000';

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
