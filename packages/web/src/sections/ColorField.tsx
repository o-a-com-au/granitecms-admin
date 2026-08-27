import { useEffect, useRef, useState } from 'react';
import { ColorPickerPopover } from './ColorPickerPopover.tsx';
import { normalizeHex } from './colour-utils.ts';

export interface ColorFieldProps {
  value: unknown;
  swatches: string[];
  labelledBy: string;
  onChange: (value: string) => void;
}

function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// Two genuinely different layouts depending on whether the theme
// declared any swatches at all - real child components, each owning
// only the state it actually needs, rather than one component
// branching partway through on a shared set of hooks (React's rules
// of hooks don't allow conditionally skipping some of a component's
// own hooks based on a prop, even one that's static in practice for
// any given field instance).
export function ColorField({ value, swatches, labelledBy, onChange }: ColorFieldProps) {
  const hasValue = typeof value === 'string' && value !== '';
  const current = hasValue ? (value as string) : '#000000';

  if (swatches.length > 0) {
    return <ColorSwatchGrid current={current} hasValue={hasValue} swatches={swatches} labelledBy={labelledBy} onChange={onChange} />;
  }
  return <ColorHexRow current={current} hasValue={hasValue} labelledBy={labelledBy} onChange={onChange} />;
}

interface VariantProps {
  current: string;
  hasValue: boolean;
  labelledBy: string;
  onChange: (value: string) => void;
}

// Variant A (swatches configured): every declared swatch as a grid
// button, plus two fixed utility cells (None to clear, + to open the
// full custom picker) - and, only while the current value doesn't
// match any declared swatch, one extra leading cell showing/
// highlighting that value. That leading cell is purely a transient
// display of the current value, never written back into the theme's
// own swatches list - the schema's swatches are fixed by the theme
// author, not something a content editor's picks can add to.
function ColorSwatchGrid({ current, hasValue, swatches, labelledBy, onChange }: VariantProps & { swatches: string[] }) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isCustomValue = hasValue && !swatches.some((swatch) => sameColor(swatch, current));

  return (
    <div className="colour-field">
      <div className="colour-field-swatch-grid" role="group" aria-labelledby={labelledBy}>
        <button
          type="button"
          className="colour-field-swatch colour-field-swatch--none"
          aria-label="No colour"
          aria-pressed={!hasValue}
          onClick={() => onChange('')}
        />
        {isCustomValue && (
          <button
            type="button"
            className="colour-field-swatch colour-field-swatch--current"
            style={{ backgroundColor: current }}
            aria-label={`Current colour: ${current}`}
            aria-pressed="true"
            onClick={() => setPopoverOpen((open) => !open)}
          />
        )}
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="colour-field-swatch"
            style={{ backgroundColor: swatch }}
            aria-label={swatch}
            aria-pressed={hasValue && sameColor(swatch, current)}
            onClick={() => onChange(swatch)}
          />
        ))}
        <button
          ref={addButtonRef}
          type="button"
          className="colour-field-swatch colour-field-swatch--add"
          aria-label="Custom colour"
          aria-expanded={popoverOpen}
          onClick={() => setPopoverOpen((open) => !open)}
        >
          +
        </button>
      </div>
      {popoverOpen && (
        <ColorPickerPopover anchorRef={addButtonRef} value={current} onChange={onChange} onClose={() => setPopoverOpen(false)} />
      )}
    </div>
  );
}

// Variant B (no swatches declared): a preview square (opens the same
// custom picker) plus an always-visible hex input - closer to the
// field's original shape from before swatches existed. Clear only
// shows once a value is actually set, same reasoning as ImageField's
// own Remove button.
function ColorHexRow({ current, hasValue, labelledBy, onChange }: VariantProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const previewRef = useRef<HTMLButtonElement>(null);
  // Empty (not "#000000") while unset, so #000000 shows as a real
  // placeholder hint rather than looking like an already-entered
  // value - current itself stays "#000000" as a reasonable starting
  // colour for the preview/popover, that's just not the same thing as
  // what the text field should display.
  const [hexText, setHexText] = useState(hasValue ? current : '');

  useEffect(() => {
    setHexText(hasValue ? current : '');
  }, [current, hasValue]);

  function commitHexText(raw: string): void {
    if (raw.trim() === '') {
      onChange('');
      return;
    }
    const normalized = normalizeHex(raw);
    if (normalized === null) {
      setHexText(hasValue ? current : '');
      return;
    }
    onChange(normalized);
  }

  return (
    <div className="colour-field">
      <div className="colour-field-input-row">
        <button
          ref={previewRef}
          type="button"
          className={`colour-field-preview${hasValue ? '' : ' colour-field-preview--none'}`}
          style={hasValue ? { backgroundColor: current } : undefined}
          aria-label="Choose a colour"
          aria-expanded={popoverOpen}
          onClick={() => setPopoverOpen((open) => !open)}
        />
        <input
          type="text"
          className="colour-field-hex-input"
          value={hexText}
          placeholder="#000000"
          spellCheck={false}
          aria-labelledby={labelledBy}
          onChange={(event) => setHexText(event.target.value)}
          onBlur={(event) => commitHexText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitHexText(event.currentTarget.value);
            }
          }}
        />
        {hasValue && (
          <button type="button" className="colour-field-clear" aria-label="Clear colour" onClick={() => onChange('')}>
            ×
          </button>
        )}
      </div>
      {popoverOpen && (
        <ColorPickerPopover anchorRef={previewRef} value={current} onChange={onChange} onClose={() => setPopoverOpen(false)} />
      )}
    </div>
  );
}
