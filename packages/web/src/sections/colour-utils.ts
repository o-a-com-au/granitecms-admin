// Accepts with or without a leading #, 3- or 6-digit, either case -
// normalized to a lowercase #rrggbb, the one strict shape both the
// native <input type="color"> and react-colorful's HexColorPicker
// require as a value. Returns null for anything else (an in-progress
// or genuinely invalid string) rather than guessing - the caller
// decides what to do with that. Shared by ColorField's own hex input
// (no-swatches variant) and ColorPickerPopover's, so both variants
// treat the same typed text the same way.
export function normalizeHex(input: string): string | null {
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
