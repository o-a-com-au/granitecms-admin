import { useState } from 'react';
import { MediaPickerModal } from '../media/MediaPickerModal.tsx';
import type { MediaItem } from '../api/site-media.ts';
import { useSites } from '../sites/useSites.ts';

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

// Preview (once a url is set) above a plain url text input, above the
// action buttons - "Choose Image"/"Change Image" opens the Media
// library picker (MediaPickerModal), and "Remove" (also only once a
// url is set) clears it. The text input stays a valid way to set the
// url directly too, e.g. a theme's own bundled asset path
// (/assets/placeholder.svg) that was never uploaded through the media
// library at all. Deliberately not wrapped in its own <label> - the
// outer SchemaField-provided <label> already covers this field's own
// first focusable control (the url input), same as the plain string
// field today, and a nested <label> would be invalid HTML.
export function ImageField({ siteId, value, onChange }: ImageFieldProps) {
  const coerced = coerceImageValue(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  // A picked-from-the-library url always arrives already absolute
  // (the backend's own media list route resolves it against the real
  // site before this component ever sees it), but a theme's own
  // hand-authored default (e.g. "/assets/placeholder.svg") is a bare
  // site-relative path - correct for the site's own renderer, but
  // meaningless as an <img src> here, since this preview lives in the
  // admin's own document, not the site's. Resolving it against the
  // site's real origin (the same SiteListEntry.url the preview
  // iframe's own <base href> fix uses - see sites.ts's fetchSitePreview)
  // is what turns that into a working preview instead of a broken icon.
  const { sites } = useSites();
  const siteUrl = sites?.find((site) => site.id === siteId)?.url;

  function handleUrlChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...coerced, url: event.target.value });
  }

  // Resets the focal point too, not just the url - a blank field
  // starting with a stale off-centre focal point from a previous image
  // would silently apply to whatever gets chosen next.
  function handleRemove(): void {
    onChange({ url: '', focalX: 0.5, focalY: 0.5 });
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

  const hasImage = coerced.url !== '';

  return (
    <div className="image-field">
      {hasImage && (
        <div className="image-field-preview">
          <img
            src={resolveImageSrc(coerced.url, siteUrl)}
            alt="Click to set focal point"
            onClick={handleImageClick}
            draggable={false}
          />
          <span
            className="image-field-focal-marker"
            aria-hidden="true"
            style={{ left: `${coerced.focalX * 100}%`, top: `${coerced.focalY * 100}%` }}
          />
        </div>
      )}
      <input type="text" className="image-field-url-input" placeholder="https://" value={coerced.url} onChange={handleUrlChange} />
      <div className="image-field-actions">
        <button type="button" onClick={() => setPickerOpen(true)}>
          {hasImage ? 'Change Image' : 'Choose Image'}
        </button>
        {hasImage && (
          <button type="button" className="image-field-remove" onClick={handleRemove}>
            Remove
          </button>
        )}
      </div>
      {pickerOpen && (
        <MediaPickerModal siteId={siteId} onSelect={handlePickerSelect} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

function clamp01(fraction: number): number {
  return Math.min(1, Math.max(0, fraction));
}

// Absolute (http(s):// or data:) urls pass through untouched - only a
// bare site-relative path needs resolving, and only once siteUrl has
// actually loaded (useSites() starts out null on first render; the
// unresolved relative path is still a reasonable img src for that one
// frame rather than blocking on it). A url that fails to parse against
// siteUrl (malformed input mid-edit) falls back to the raw value
// rather than throwing - still broken, but no worse than before this
// existed, and never crashes the field.
function resolveImageSrc(url: string, siteUrl: string | undefined): string {
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || !siteUrl) {
    return url;
  }
  try {
    return new URL(url, siteUrl).href;
  } catch {
    return url;
  }
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
