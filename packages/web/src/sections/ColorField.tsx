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
  const current = typeof value === 'string' && value !== '' ? value : '#000000';

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
      <input type="color" value={current} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
