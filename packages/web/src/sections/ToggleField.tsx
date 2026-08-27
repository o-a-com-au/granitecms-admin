export interface ToggleFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// Still a real <input type="checkbox"> under the hood - only its paint
// changes. The checkbox itself is visually hidden (opacity: 0, not
// display: none) rather than removed, so it stays focusable and
// keeps native checkbox semantics/keyboard behaviour (Space to
// toggle) for free; the track is a purely decorative sibling <span>,
// styled from the checkbox's :checked/:focus state via a sibling
// selector (toggle-field.css) rather than a pseudo-element on the
// input itself, which has patchier cross-browser support once
// appearance: none is involved.
export function ToggleField({ checked, onChange }: ToggleFieldProps) {
  return (
    <span className="toggle-field">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-field-track" aria-hidden="true" />
    </span>
  );
}
