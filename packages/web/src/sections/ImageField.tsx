export interface ImageFieldValue {
  url: string;
  focalX: number;
  focalY: number;
}

export interface ImageFieldProps {
  value: unknown;
  onChange: (value: ImageFieldValue) => void;
}

// No Media/asset library exists in this app yet (AppShell.tsx's own
// "Media" tab is a disabled placeholder) - scoped to what's buildable
// without one: a URL text input plus a click-to-set focal point on
// whatever image that URL loads. Deliberately not wrapped in its own
// <label> - the outer SchemaField-provided <label> already covers this
// field's one focusable control, same as the plain string field today,
// and a nested <label> would be invalid HTML.
export function ImageField({ value, onChange }: ImageFieldProps) {
  const coerced = coerceImageValue(value);

  function handleUrlChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...coerced, url: event.target.value });
  }

  // clientX/clientY and getBoundingClientRect() are both already
  // viewport-relative, so no scroll-offset correction is needed.
  // Guards a zero-sized rect (image not loaded/broken) rather than
  // dividing into NaN.
  function handleImageClick(event: React.MouseEvent<HTMLImageElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const focalX = clamp01((event.clientX - rect.left) / rect.width);
    const focalY = clamp01((event.clientY - rect.top) / rect.height);
    onChange({ ...coerced, focalX, focalY });
  }

  return (
    <div className="image-field">
      <input type="text" placeholder="https://" value={coerced.url} onChange={handleUrlChange} />
      {coerced.url !== '' && (
        <div className="image-field-preview">
          <img src={coerced.url} alt="Click to set focal point" onClick={handleImageClick} />
          <span
            className="image-field-focal-marker"
            aria-hidden="true"
            style={{ left: `${coerced.focalX * 100}%`, top: `${coerced.focalY * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function clamp01(fraction: number): number {
  return Math.min(1, Math.max(0, fraction));
}

// Merges into whatever's already there rather than resetting - typing
// a new URL must preserve an existing focal point, and clicking to set
// the focal point must preserve the existing URL. Absent/malformed
// sub-values (a value the field has never touched, or content authored
// some other way) default to url: '' and a centred 0.5/0.5 focal
// point, the same convention SchemaField's own string-field fallback
// uses for an absent value.
function coerceImageValue(value: unknown): ImageFieldValue {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const url = typeof record.url === 'string' ? record.url : '';
  const focalX = typeof record.focalX === 'number' ? record.focalX : 0.5;
  const focalY = typeof record.focalY === 'number' ? record.focalY : 0.5;
  return { url, focalX, focalY };
}
