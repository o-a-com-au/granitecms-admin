import { useState } from 'react';

// Grabbed frames are downscaled to this width before being encoded.
// A grid thumbnail is ~140px wide, so this covers high-DPI screens
// without carrying a full-resolution still around as a data URL.
const THUMB_WIDTH = 320;
import type { MediaItem } from '../api/site-media.ts';
import { FilmIcon } from '../sections/FilmIcon.tsx';
import { formatDuration } from './mediaKind.ts';

// A video tile's thumbnail. A video has no frame to show as an <img>,
// so the tile shows a fixed placeholder (public/video-placeholder.jpg)
// marked with a film icon, and labels it with the clip's own duration -
// requested directly, with a mockup: icon bottom-left, duration
// bottom-right.
//
// The duration comes from a real metadata read of the file itself
// rather than anything stored: MediaItem carries only
// { name, size, mtimeMs, url }, and the agent keeps no second source of
// truth about a media file. preload="metadata" fetches just the header
// rather than the whole clip - which only became true once the agent
// learned to answer Range requests; before that this would have pulled
// every video in the grid down in full.
//
// Hidden by position/opacity rather than display: none, since a
// display: none video is not reliably obliged to fetch anything at all.
export function VideoThumb({ item }: { item: MediaItem }) {
  const [duration, setDuration] = useState<string | null>(null);
  const [grabbedFrame, setGrabbedFrame] = useState<string | null>(null);

  // Seeks a little way in before grabbing, rather than taking whatever
  // is at 0s: the first frame of a real clip is very often black, a
  // fade-in, or a blank slate, which makes a worse thumbnail than the
  // placeholder would. 10% in lands inside the actual content of a
  // short loop without needing to understand the clip.
  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>): void {
    const video = event.currentTarget;
    setDuration(formatDuration(video.duration));
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }
    try {
      video.currentTime = video.duration * 0.1;
    } catch {
      // Some browsers (and jsdom) refuse the seek outright. No grab
      // then, and the placeholder simply stays.
    }
  }

  // Everything here is best-effort and must never throw into render:
  // the placeholder is a real, designed fallback, not an error state,
  // so any failure just leaves it in place.
  function handleSeeked(event: React.SyntheticEvent<HTMLVideoElement>): void {
    const video = event.currentTarget;
    try {
      const { videoWidth, videoHeight } = video;
      if (videoWidth === 0 || videoHeight === 0) {
        return;
      }
      const scale = Math.min(1, THUMB_WIDTH / videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(videoWidth * scale);
      canvas.height = Math.round(videoHeight * scale);
      const context = canvas.getContext('2d');
      if (context === null) {
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Throws SecurityError if the canvas is tainted, which is
      // precisely what crossOrigin="anonymous" below exists to prevent.
      setGrabbedFrame(canvas.toDataURL('image/jpeg', 0.7));
    } catch {
      // Tainted canvas, an undecodable frame, or no 2d context at all.
    }
  }

  return (
    <>
      <img
        src={grabbedFrame ?? '/video-placeholder.jpg'}
        alt={item.name}
        loading="lazy"
        draggable={false}
      />
      <span className="media-library-item-kind" aria-hidden="true">
        <FilmIcon />
      </span>
      {duration !== null && <span className="media-library-item-duration">{duration}</span>}
      <video
        className="media-library-item-probe"
        src={item.url}
        preload="metadata"
        muted
        playsInline
        aria-hidden="true"
        tabIndex={-1}
        // crossOrigin is what makes the frame grab possible at all.
        // Media is served from the site, a different origin to this
        // admin, and drawing a cross-origin video onto a canvas taints
        // it, so toDataURL would throw SecurityError. The agent answers
        // /media/* with Access-Control-Allow-Origin: * (its own
        // routes/media-public.ts), and this attribute is what makes the
        // browser actually treat the response as CORS-clean. If a file
        // ever came from somewhere that does not send that header the
        // load simply fails, costing the duration too, and the
        // placeholder stands in - which is the designed fallback.
        crossOrigin="anonymous"
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleSeeked}
      />
    </>
  );
}
