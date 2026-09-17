import type { MediaItem } from '../api/site-media.ts';

// What the media library can hold. Derived from the filename's own
// extension rather than any stored metadata: MediaItem carries only
// { name, size, mtimeMs, url }, and the agent deliberately keeps no
// second source of truth about a file beyond its content-addressed
// name (see the agent's media/filename.ts). An extension test needs no
// server change and cannot drift from what was actually uploaded.
//
// These lists mirror the agent's own ALLOWED_UPLOAD_EXTENSIONS. That
// is a real duplication across a repo boundary, kept deliberately: the
// admin is a separate deploy and cannot import from the agent, and the
// agent stays the authority regardless (it re-checks every upload and
// answers 415). This copy exists for fast client-side feedback and for
// telling one kind of tile from another, never as the rule itself.
const VIDEO_EXTENSIONS = ['.mp4', '.webm'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// The admin's single copy of what may be uploaded, used both for the
// client-side pre-check and for the file input's own accept attribute -
// which were previously two separate hand-maintained lists in
// MediaLibrary.tsx, on top of the agent's. One copy per repo is the
// least this can be without importing across a deploy boundary.
export const ALLOWED_UPLOAD_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

// Real media types rather than a list of extensions: a file picker
// filters far more reliably on these, and they mirror the agent's own
// mime-types.ts entries for the same files. .svg is absent on purpose,
// matching the agent - it is rejected there as an unsanitised
// stored-XSS path, so it is never offered here either.
export const UPLOAD_ACCEPT_ATTRIBUTE =
  'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm';

export function hasAllowedUploadExtension(filename: string): boolean {
  return hasExtension(filename, ALLOWED_UPLOAD_EXTENSIONS);
}

export type MediaKind = 'all' | 'images' | 'videos';

// Every label is 6 characters or fewer, which matters: SelectField's
// own shouldRenderAsTabs only renders three options as a segmented
// control when each label is 8 characters or fewer, and the media
// toolbar reuses that same .select-field-tabs look. Longer labels here
// would quietly stop matching the app's own convention for this
// control.
export const MEDIA_KINDS: MediaKind[] = ['all', 'images', 'videos'];

function hasExtension(name: string, extensions: string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

export function isVideoItem(item: MediaItem): boolean {
  return hasExtension(item.name, VIDEO_EXTENSIONS);
}

export function isImageItem(item: MediaItem): boolean {
  return hasExtension(item.name, IMAGE_EXTENSIONS);
}

// 'all' matches everything, including a file whose extension is in
// neither list - a media library should never hide a file it is
// holding just because this admin does not recognise its type.
export function matchesKind(item: MediaItem, kind: MediaKind): boolean {
  if (kind === 'all') {
    return true;
  }
  return kind === 'videos' ? isVideoItem(item) : isImageItem(item);
}

// mm:ss, the form a video player uses. Rounded down, so a 15.8s clip
// reads 0:15 rather than claiming 0:16 of playable content. Anything
// non-finite (a probe that failed, a file the browser cannot decode)
// returns null so the caller can render nothing rather than "NaN:NaN".
export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
