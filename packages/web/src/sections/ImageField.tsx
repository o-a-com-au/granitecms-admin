import { useState } from 'react';
import { MediaPickerModal } from '../media/MediaPickerModal.tsx';
import type { MediaItem } from '../api/site-media.ts';

export interface ImageFieldValue {
  url: string;
  focalX: number;
  focalY: number;
}

export interface ImageFieldProps {
  siteId: string;
  value: unknown;
  onChange: (value: ImageFieldValue) => void;
}

// A URL text input plus a "Choose Image" button opening the Media
// library picker (MediaPickerModal), plus a click-to-set focal point
// on whatever image ends up loaded. The text input stays too - both
// remain valid ways to set the url. Deliberately not wrapped in its
// own <label> - the outer SchemaField-provided <label> already covers
// this field's own first focusable control (the text input), same as
// the plain string field today, and a nested <label> would be invalid
// HTML.
export function ImageField({ siteId, value, onChange }: ImageFieldProps) {
  const coerced = coerceImageValue(value);
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleUrlChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...coerced, url: event.target.value });
  }

  // Only the url changes - an existing focal point (from a previous
  // image) is preserved, same merge convention handleUrlChange already
  // uses for typed input.
  function handlePickerSelect(item: MediaItem): void {
    onChange({ ...coerced, url: item.url });
    setPickerOpen(false);
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
      <div className="image-field-url-row">
        <input type="text" placeholder="https://" value={coerced.url} onChange={handleUrlChange} />
        <button type="button" onClick={() => setPickerOpen(true)}>
          Choose Image
        </button>
      </div>
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
      {pickerOpen && (
        <MediaPickerModal siteId={siteId} onSelect={handlePickerSelect} onClose={() => setPickerOpen(false)} />
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
