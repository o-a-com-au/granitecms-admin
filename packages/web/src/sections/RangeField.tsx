import { useEffect, useState } from 'react';

export interface RangeFieldProps {
  value: unknown;
  minimum: number;
  maximum: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

// Shopify's own documented behaviour: a value outside [minimum,
// maximum] reverts to whichever bound it crossed, and a value that
// doesn't land on a step is rounded to the nearest one - in that
// order, so a slightly-past-maximum value that would round up to an
// out-of-range step still ends up pinned at maximum, not one step
// short of it.
function clampToStep(raw: number, minimum: number, maximum: number, step: number): number {
  const clamped = Math.min(maximum, Math.max(minimum, raw));
  const snapped = minimum + Math.round((clamped - minimum) / step) * step;
  return Math.min(maximum, Math.max(minimum, snapped));
}

// The slider and the number box are two views of one committed value,
// not two independent controls - dragging the slider commits
// immediately (native range inputs can't leave [min, max] anyway, and
// mid-drag intermediate values are meant to apply live). The number
// box instead buffers local text and only commits (clamping/rounding
// per clampToStep) on blur, the same "let them finish typing" pattern
// SchemaField's own RawJsonFallback already uses - committing on every
// keystroke would make it impossible to type "16" starting from a min
// of 12 without the "1" alone snapping straight to 12.
export function RangeField({ value, minimum, maximum, step, unit, onChange }: RangeFieldProps) {
  const current = typeof value === 'number' ? value : minimum;
  const [text, setText] = useState(String(current));

  useEffect(() => {
    setText(String(current));
  }, [current]);

  function commit(raw: string): void {
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) {
      setText(String(current));
      return;
    }
    onChange(clampToStep(parsed, minimum, maximum, step));
  }

  return (
    <div className="range-field">
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={current}
        onChange={(event) => onChange(clampToStep(Number.parseFloat(event.target.value), minimum, maximum, step))}
      />
      <div className="range-field-value">
        <input
          type="number"
          min={minimum}
          max={maximum}
          step={step}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
        />
        {unit && <span className="range-field-unit">{unit}</span>}
      </div>
    </div>
  );
}
