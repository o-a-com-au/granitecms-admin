import { useState } from 'react';
import { MediaPickerModal } from '../media/MediaPickerModal.tsx';
import { ImageOffIcon } from './ImageOffIcon.tsx';
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
  // Tracks the specific *resolved* src that failed, not the raw stored
  // url - a site-relative stored value resolves to a different src
  // once siteUrl below finishes loading, and comparing against the raw
  // url would leave a transient failure from before that load latched
  // forever, long after the correctly-resolved src would have worked.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);
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
  const resolvedSrc = resolveImageSrc(coerced.url, siteUrl);
  // useSites() starts out null while /api/sites is still in flight. A
  // site-relative stored url resolves to something meaningless against
  // the admin's own origin until that finishes - rendering it as a real
  // <img src> for that one window would fire a spurious onError that
  // (keyed on the eventual correct resolvedSrc or not) has nothing to
  // do with whether the image itself is actually broken. Absolute/data
  // urls need no such wait, since resolveImageSrc never touches siteUrl
  // for those.
  const awaitingSiteUrl = sites === null && isSiteRelativeUrl(coerced.url);

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
  // uses for typed input. item.url always arrives absolute (see
  // toStoredImageUrl's own comment below) - converted back to
  // site-relative before it's ever written into content, so a page's
  // stored settings read the same way regardless of whether the image
  // was picked through the library or seeded by some other tool.
  function handlePickerSelect(item: MediaItem): void {
    onChange({ ...coerced, url: toStoredImageUrl(item.url, siteUrl) });
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
      {/* Grouped into one card, not two separate flex children of
          .image-field - the preview and url input are meant to read as
          one element once there's an image, sharing one border/corner
          radius with no gap at the seam (image-field.css's own
          --attached modifier below), not the field's normal gap. */}
      <div className={`image-field-card${hasImage ? ' image-field-card--attached' : ''}`}>
        {hasImage && (
          <div className="image-field-preview">
            {erroredSrc === resolvedSrc ? (
              // Same size/background as a real loaded image, not the
              // browser's own tiny broken-image glyph collapsing the
              // well down to almost nothing - reported directly.
              <div className="image-field-preview-error">
                <ImageOffIcon />
                <span>Image failed to load</span>
              </div>
            ) : awaitingSiteUrl ? (
              // Same box, no verdict yet either way - rendering the
              // <img> now would mean attempting a site-relative path
              // against the admin's own origin, a guaranteed failure
              // that says nothing about whether the real image is fine.
              <div className="image-field-preview-error" />
            ) : (
              <>
                <img
                  src={resolvedSrc}
                  alt="Click to set focal point"
                  onClick={handleImageClick}
                  onError={() => setErroredSrc(resolvedSrc)}
                  draggable={false}
                />
                <span
                  className="image-field-focal-marker"
                  aria-hidden="true"
                  style={{ left: `${coerced.focalX * 100}%`, top: `${coerced.focalY * 100}%` }}
                />
              </>
            )}
          </div>
        )}
        <input type="text" className="image-field-url-input" placeholder="https://" value={coerced.url} onChange={handleUrlChange} />
      </div>
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
// caller is responsible for not rendering an <img> off the unresolved
// relative path in the meantime - see ImageField's own awaitingSiteUrl).
// A url that fails to parse against siteUrl (malformed input mid-edit)
// falls back to the raw value rather than throwing - still broken, but
// no worse than before this existed, and never crashes the field.
// Exported: GalleryField.tsx needs the exact same resolution for each
// of its own thumbnails.
export function resolveImageSrc(url: string, siteUrl: string | undefined): string {
  if (!isSiteRelativeUrl(url) || !siteUrl) {
    return url;
  }
  try {
    return new URL(url, siteUrl).href;
  } catch {
    return url;
  }
}

// A bare site-relative path ("/media/a.jpg") is the only shape
// resolveImageSrc's siteUrl argument actually matters for - an
// absolute http(s) url or a data: url means whatever siteUrl says.
function isSiteRelativeUrl(url: string): boolean {
  return !/^(https?:)?\/\//i.test(url) && !url.startsWith('data:');
}

// The media list route (site-media.ts's toAbsoluteUrl) deliberately
// hands back an already-absolute url for every MediaItem, since the
// picker/library's own grid thumbnails load them directly cross-origin
// from the site, never through this admin's own backend - but that
// same absolute form has no business ending up in a page's stored
// settings, where it'd sit next to plenty of other images stored as a
// bare "/media/<name>" path (seeded some other way, or authored before
// this existed), and would break entirely if the site were ever served
// from a different host. Undoes that resolution at the one point a
// picked url is about to be written down, not at the source - the
// picker/library still needs the absolute form for its own display.
// Only strips it down when it actually resolves back to the site's own
// origin; a url pointing somewhere else entirely (shouldn't happen
// today, but not this function's job to assume) is left absolute.
export function toStoredImageUrl(absoluteUrl: string, siteUrl: string | undefined): string {
  if (!siteUrl) {
    return absoluteUrl;
  }
  try {
    const picked = new URL(absoluteUrl);
    if (picked.origin === new URL(siteUrl).origin) {
      return picked.pathname + picked.search + picked.hash;
    }
  } catch {
    // Malformed input - leave it exactly as it arrived.
  }
  return absoluteUrl;
}

// Merges into whatever's already there rather than resetting - typing
// a new URL must preserve an existing focal point, and clicking to set
// the focal point must preserve the existing URL. Absent/malformed
// sub-values (a value the field has never touched, or content authored
// some other way) default to url: '' and a centred 0.5/0.5 focal
// point, the same convention SchemaField's own string-field fallback
// uses for an absent value. Exported: GalleryField.tsx reuses this to
// coerce each entry of its own array of image objects the same way.
export function coerceImageValue(value: unknown): ImageFieldValue {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const url = typeof record.url === 'string' ? record.url : '';
  const focalX = typeof record.focalX === 'number' ? record.focalX : 0.5;
  const focalY = typeof record.focalY === 'number' ? record.focalY : 0.5;
  return { url, focalX, focalY };
}
