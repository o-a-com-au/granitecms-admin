import { useState } from 'react';
import { MediaPickerModal } from '../media/MediaPickerModal.tsx';
import { FilmIcon } from './FilmIcon.tsx';
import { isSiteRelativeUrl, resolveImageSrc, toStoredImageUrl } from './ImageField.tsx';
import type { MediaItem } from '../api/site-media.ts';
import { useSites } from '../sites/useSites.ts';

export interface VideoFieldValue {
  url: string;
  poster: string;
}

export interface VideoFieldProps {
  siteId: string;
  value: unknown;
  onChange: (value: VideoFieldValue) => void;
  // Supplied because this is a compound field: SchemaField renders a
  // plain <div> rather than a wrapping <label> for it, so the url
  // input needs the association spelled out. See the note below.
  labelledBy: string;
}

// The `format: "video"` counterpart to ImageField, for the short silent
// loops that stand in for a hero image. Deliberately the same shape as
// that field (preview, then a plain url input, then actions), so the
// two read as siblings rather than as two unrelated widgets.
//
// Stores { url, poster } rather than ImageField's { url, focalX,
// focalY }. A poster is the still a browser shows before the clip has
// loaded and whenever it will not play at all, so without one a hero
// loop is a blank rectangle on exactly the connections that can least
// afford to wait for it. No focal point: these are played as a
// background loop rather than cropped around a subject, and a focal
// point that silently did nothing would be worse than its absence.
//
// The url resolution helpers are ImageField's own, reused rather than
// reimplemented - GalleryField already imports them from there, so this
// follows the established direction rather than inventing a new home
// for them.
//
// Registered as a compound field in SchemaField (so it gets a <div>
// wrapper and an explicit aria-labelledby, rather than being wrapped in
// a <label> the way ImageField still is). Two reasons, both real: the
// poster note below is ordinary text inside the field, and a wrapping
// <label> folds every scrap of non-control text it contains into the
// accessible name, so the url input would announce as "<label> Shown
// before the video loads, and whenever it cannot play". The second is
// the hover-forwarding trap this app has already hit once with
// SelectField's tabs - a <label> forwards hover to its first labelable
// descendant, so hovering any of this field's four buttons would light
// up the url input.
export function VideoField({ siteId, value, onChange, labelledBy }: VideoFieldProps) {
  const coerced = coerceVideoValue(value);
  // One picker component serving two different targets, so it has to
  // remember which button opened it.
  const [picker, setPicker] = useState<null | 'video' | 'poster'>(null);
  // Keyed on the resolved src, not the raw stored url - the same trap
  // ImageField documents: a site-relative value resolves differently
  // once siteUrl arrives, and keying on the raw url would latch a
  // failure from before that forever.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);

  const { sites } = useSites();
  const siteUrl = sites?.find((site) => site.id === siteId)?.url;
  const resolvedSrc = resolveImageSrc(coerced.url, siteUrl);
  const resolvedPoster = coerced.poster === '' ? undefined : resolveImageSrc(coerced.poster, siteUrl);
  const awaitingSiteUrl = sites === null && isSiteRelativeUrl(coerced.url);

  const hasVideo = coerced.url !== '';
  const hasPoster = coerced.poster !== '';

  function handleUrlChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange({ ...coerced, url: event.target.value });
  }

  // Clears the poster along with the clip. A poster left pointing at a
  // still from a video that is no longer here would show up as the
  // first frame of whatever replaces it.
  function handleRemove(): void {
    onChange({ url: '', poster: '' });
  }

  function handlePick(item: MediaItem): void {
    const stored = toStoredImageUrl(item.url, siteUrl);
    onChange(picker === 'poster' ? { ...coerced, poster: stored } : { ...coerced, url: stored });
    setPicker(null);
  }

  return (
    <div className="video-field">
      <div className={`video-field-card${hasVideo ? ' video-field-card--attached' : ''}`}>
        {hasVideo && (
          <div className="video-field-preview">
            {erroredSrc === resolvedSrc ? (
              <div className="video-field-preview-error">
                <FilmIcon />
                <span>Video failed to load</span>
              </div>
            ) : awaitingSiteUrl ? (
              // No verdict either way yet - see ImageField's own
              // awaitingSiteUrl for why rendering the real element now
              // would fire a meaningless error.
              <div className="video-field-preview-error" />
            ) : (
              // controls, and deliberately no autoplay: an admin panel
              // that starts playing on its own the moment a field
              // scrolls into view is hostile, and respecting
              // prefers-reduced-motion properly is not something an
              // autoplaying element can do from CSS. The author presses
              // play. muted and loop still match how the clip is
              // actually used on the site.
              <video
                src={resolvedSrc}
                poster={resolvedPoster}
                controls
                muted
                loop
                playsInline
                preload="metadata"
                onError={() => setErroredSrc(resolvedSrc)}
              />
            )}
          </div>
        )}
        <input
          type="text"
          className="video-field-url-input"
          placeholder="https://"
          aria-labelledby={labelledBy}
          value={coerced.url}
          onChange={handleUrlChange}
        />
      </div>
      <div className="video-field-actions">
        <button type="button" onClick={() => setPicker('video')}>
          {hasVideo ? 'Change Video' : 'Choose Video'}
        </button>
        {hasVideo && (
          <button type="button" className="video-field-remove" onClick={handleRemove}>
            Remove
          </button>
        )}
      </div>
      {hasVideo && (
        <div className="video-field-poster">
          <span className="video-field-poster-note">
            Shown before the video loads, and whenever it cannot play.
          </span>
          <div className="video-field-actions">
            <button type="button" onClick={() => setPicker('poster')}>
              {hasPoster ? 'Change Poster' : 'Choose Poster'}
            </button>
            {hasPoster && (
              <button type="button" className="video-field-remove" onClick={() => onChange({ ...coerced, poster: '' })}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      {picker !== null && (
        <MediaPickerModal
          siteId={siteId}
          heading={picker === 'poster' ? 'Choose a poster image' : 'Choose a video'}
          onSelect={handlePick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// Merges into whatever is already stored rather than resetting, the
// same convention coerceImageValue uses: an absent or malformed
// sub-value (content authored before this field existed, or by some
// other tool) falls back to an empty string rather than undefined, so
// the controlled input never flips to uncontrolled.
export function coerceVideoValue(value: unknown): VideoFieldValue {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const url = typeof record.url === 'string' ? record.url : '';
  const poster = typeof record.poster === 'string' ? record.poster : '';
  return { url, poster };
}
