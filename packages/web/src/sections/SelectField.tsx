export interface SelectFieldProps {
  value: unknown;
  options: unknown[];
  labelledBy: string;
  onChange: (value: unknown) => void;
}

// Consolidates what used to be two separate opt-in widgets (a plain
// <select>, or format: "radio" for a segmented-tab look) into one:
// every enum now picks its own presentation automatically, so a theme
// author never has to choose. A short list of short labels reads fine
// as tabs at a glance; a long list, or even one long label, gets
// cramped and wraps awkwardly as tabs, so it falls back to a dropdown
// instead. These thresholds are arbitrary judgement calls, not derived
// from anything - tune here if a real theme's enum sits right on the
// boundary and looks wrong either way.
const MAX_TAB_OPTIONS = 3;

// How long a label can be before it's too cramped to read as a tab
// shrinks as more tabs have to share the same row - three even thirds
// have far less room per tab than two even halves (requested
// directly): 3 options tolerate up to 8 characters each; 2 tolerate up
// to 14. A single option is never actually cramped for space the way
// multiple tabs sharing a row are, so it keeps that same, looser
// 2-option threshold rather than a third number nobody asked for.
function maxTabLabelLength(optionCount: number): number {
  return optionCount === 3 ? 8 : 14;
}

export function shouldRenderAsTabs(options: unknown[]): boolean {
  if (options.length === 0 || options.length > MAX_TAB_OPTIONS) {
    return false;
  }
  const maxLength = maxTabLabelLength(options.length);
  return options.every((option) => String(option).length <= maxLength);
}

// Native <select>/tab button values are always strings - map back to
// whichever original enum entry stringifies to the selected one, so a
// non-string enum (not seen in any real theme file today, but ajv
// itself doesn't forbid it) still round-trips to its real type.
function coerceEnumValue(options: unknown[], selected: string): unknown {
  return options.find((entry) => String(entry) === selected) ?? selected;
}

export function SelectField({ value, options, labelledBy, onChange }: SelectFieldProps) {
  if (shouldRenderAsTabs(options)) {
    return (
      <div className="select-field-tabs" role="group" aria-labelledby={labelledBy}>
        {options.map((option) => {
          const optionValue = String(option);
          return (
            <button
              key={optionValue}
              type="button"
              aria-pressed={String(value ?? '') === optionValue}
              onClick={() => onChange(coerceEnumValue(options, optionValue))}
            >
              {optionValue}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <select value={String(value ?? '')} onChange={(event) => onChange(coerceEnumValue(options, event.target.value))}>
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {String(option)}
        </option>
      ))}
    </select>
  );
}
