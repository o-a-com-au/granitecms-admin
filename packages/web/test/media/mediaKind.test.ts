import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../../src/api/site-media.ts';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  formatDuration,
  hasAllowedUploadExtension,
  isImageItem,
  isVideoItem,
  matchesKind,
  MEDIA_KINDS,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from '../../src/media/mediaKind.ts';

function item(name: string): MediaItem {
  return { name, size: 1, mtimeMs: 1, url: `/media/${name}` };
}

describe('mediaKind', () => {
  it('tells videos from images by extension, case-insensitively', () => {
    expect(isVideoItem(item('loop-abc123.mp4'))).toBe(true);
    expect(isVideoItem(item('loop-abc123.WEBM'))).toBe(true);
    expect(isVideoItem(item('photo-abc123.jpg'))).toBe(false);
    expect(isImageItem(item('photo-abc123.JPG'))).toBe(true);
    expect(isImageItem(item('loop-abc123.mp4'))).toBe(false);
  });

  it('"all" shows everything, including a file whose type neither list knows', () => {
    // A media library should never hide a file it is actually holding
    // just because this admin does not recognise the extension.
    const unknown = item('mystery-abc123.tiff');
    expect(matchesKind(unknown, 'all')).toBe(true);
    expect(matchesKind(unknown, 'images')).toBe(false);
    expect(matchesKind(unknown, 'videos')).toBe(false);
  });

  it('filters to one kind at a time', () => {
    expect(matchesKind(item('a.mp4'), 'videos')).toBe(true);
    expect(matchesKind(item('a.mp4'), 'images')).toBe(false);
    expect(matchesKind(item('a.png'), 'images')).toBe(true);
    expect(matchesKind(item('a.png'), 'videos')).toBe(false);
  });

  it('accepts exactly the extensions the agent accepts, and still refuses .svg', () => {
    for (const extension of ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']) {
      expect(hasAllowedUploadExtension(`file${extension}`), extension).toBe(true);
    }
    // Rejected server-side as an unsanitised stored-XSS path, so never
    // offered here either.
    expect(hasAllowedUploadExtension('icon.svg')).toBe(false);
    // .mov is deliberately out: QuickTime frequently will not play in
    // Chrome or Firefox, so accepting it would upload files that
    // silently fail for many visitors.
    expect(hasAllowedUploadExtension('clip.mov')).toBe(false);
    expect(ALLOWED_UPLOAD_EXTENSIONS).toHaveLength(7);
  });

  it('offers video types in the file picker accept attribute, but never svg', () => {
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('video/mp4');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('video/webm');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).not.toContain('svg');
  });

  it('keeps every filter label short enough for the segmented control this app uses', () => {
    // SelectField's own shouldRenderAsTabs renders three options as
    // tabs only while each label is 8 characters or fewer. Longer
    // labels here would quietly stop matching that convention.
    expect(MEDIA_KINDS).toHaveLength(3);
    for (const label of MEDIA_KINDS) {
      expect(label.length, label).toBeLessThanOrEqual(8);
    }
  });

  it('formats a duration as mm:ss, rounding down', () => {
    expect(formatDuration(15)).toBe('0:15');
    // 15.8s reads 0:15, not 0:16 - never claim more playable content
    // than there is.
    expect(formatDuration(15.8)).toBe('0:15');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('returns null for a duration the browser could not determine, so no NaN:NaN ever renders', () => {
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(Infinity)).toBeNull();
    expect(formatDuration(-1)).toBeNull();
  });
});
