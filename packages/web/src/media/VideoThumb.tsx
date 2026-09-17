import { useState } from 'react';
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

  return (
    <>
      <img src="/video-placeholder.jpg" alt={item.name} loading="lazy" draggable={false} />
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
        // formatDuration returns null for a non-finite duration - a
        // probe that failed, or a file this browser cannot decode - so
        // the label simply never appears rather than reading NaN:NaN.
        onLoadedMetadata={(event) => setDuration(formatDuration(event.currentTarget.duration))}
      />
    </>
  );
}
