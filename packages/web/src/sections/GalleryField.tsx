import { useRef, useState, type DragEvent } from 'react';
import { MediaPickerModal } from '../media/MediaPickerModal.tsx';
import type { MediaItem } from '../api/site-media.ts';
import { useSites } from '../sites/useSites.ts';
import { coerceImageValue, resolveImageSrc, toStoredImageUrl } from './ImageField.tsx';
import type { ImageFieldValue } from './ImageField.tsx';
import { CloseIcon } from './CloseIcon.tsx';
import { computeDropIndex, reorderList } from './drag-reorder.ts';

export interface GalleryFieldProps {
  siteId: string;
  value: unknown;
  minItems?: number;
  maxItems?: number;
  labelledBy: string;
  onChange: (value: ImageFieldValue[]) => void;
}

function asImageArray(value: unknown): ImageFieldValue[] {
  return Array.isArray(value) ? value.map((entry) => coerceImageValue(entry)) : [];
}

interface TileProps {
  image: ImageFieldValue;
  index: number;
  siteUrl: string | undefined;
  isDragging: boolean;
  canRemove: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
}

// One grid cell - the whole tile is the drag surface (no separate
// handle, matching StringListField's own chips), with a hover-reveal
// remove button in the corner rather than StringListField's always-
// visible one: a bare tag has nothing else to look at, but a picture
// fills the whole tile, and an always-visible "x" overlaying it would
// be a permanent, distracting mark on every single image. No per-image
// focal-point editing here (unlike the standalone ImageField this
// reuses coerceImageValue/resolveImageSrc from) - deliberately out of
// scope, see GalleryField's own comment below.
function Tile({ image, index, siteUrl, isDragging, canRemove, onDragStart, onDragOver, onDrop, onDragEnd, onRemove }: TileProps) {
  return (
    <div
      className={`gallery-field-tile${isDragging ? ' is-dragging' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <img src={resolveImageSrc(image.url, siteUrl)} alt={`Image ${index + 1}`} draggable={false} />
      {canRemove && (
        <button type="button" className="gallery-field-tile-remove" aria-label={`Remove image ${index + 1}`} onClick={onRemove}>
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

// SchemaField.tsx's own widget for `"type": "array", "items": { "type":
// "object", "format": "image" }` - a grid of image thumbnails inside a
// bordered box (mirrors StringListField's own box-of-chips shape),
// each one draggable to reorder and removable via a hover-reveal "x".
// Adding goes through the same MediaPickerModal a standalone ImageField
// already opens - there's no free-text equivalent of StringListField's
// trailing input, since a gallery entry is always a picked (or
// uploaded) media item, never typed.
//
// Deliberately just `{ url, focalX, focalY }` per entry, nothing else -
// the same shape a lone `format: "image"` field already stores, no
// wider than that. A theme that also needs a caption/alt/time per
// image (an AI-authored theme's own real attempt at this - see
// AGENTS.md's "closed set of field shapes" section) isn't a gallery
// field's job: that's a repeating *record* with several independent
// fields, which is exactly what blocks already exist for - a `frame`
// block type with its own image/alt/time settings, nested under a
// section, gets real add/remove/reorder and a real settings form for
// each of those fields for free, instead of a single array setting
// trying to grow a bespoke shape the admin has no widget for.
export function GalleryField({ siteId, value, minItems, maxItems, labelledBy, onChange }: GalleryFieldProps) {
  const items = asImageArray(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draggedIndex, setDraggedIndexState] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const { sites } = useSites();
  const siteUrl = sites?.find((site) => site.id === siteId)?.url;

  function setDraggedIndex(index: number | null): void {
    draggedIndexRef.current = index;
    setDraggedIndexState(index);
  }

  // Same gap maths as StringListField's own chips, fed this tile's own
  // horizontal rect - an approximation for a genuinely 2-D grid (it
  // only ever compares against the one tile currently under the
  // pointer, not the whole grid's layout), but a fine one at the small
  // item counts a gallery like this actually has (minItems/maxItems in
  // the 2-8 range in every real example seen so far).
  function handleTileDragOver(event: DragEvent<HTMLDivElement>, index: number): void {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    dropIndexRef.current = computeDropIndex(event.clientX, { top: rect.left, height: rect.width }, index);
  }

  function handleDrop(): void {
    const fromIndex = draggedIndexRef.current;
    const toIndex = dropIndexRef.current;
    if (fromIndex !== null && toIndex !== null) {
      const next = reorderList(items, fromIndex, toIndex);
      if (next !== items) {
        onChange(next);
      }
    }
    setDraggedIndex(null);
    dropIndexRef.current = null;
  }

  function handleDragEnd(): void {
    setDraggedIndex(null);
    dropIndexRef.current = null;
  }

  const canAdd = maxItems === undefined || items.length < maxItems;
  const canRemove = minItems === undefined || items.length > minItems;

  // item.url always arrives absolute - see toStoredImageUrl's own
  // comment (ImageField.tsx) for why that's converted back to
  // site-relative before it's written into content.
  function handlePickerSelect(item: MediaItem): void {
    onChange([...items, { url: toStoredImageUrl(item.url, siteUrl), focalX: 0.5, focalY: 0.5 }]);
    setPickerOpen(false);
  }

  return (
    <div className="gallery-field">
      <div className="gallery-field-box" role="group" aria-labelledby={labelledBy}>
        {items.map((image, index) => (
          <Tile
            key={index}
            image={image}
            index={index}
            siteUrl={siteUrl}
            isDragging={draggedIndex === index}
            canRemove={canRemove}
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => handleTileDragOver(event, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onRemove={() => onChange(items.filter((_, i) => i !== index))}
          />
        ))}
        <button type="button" className="gallery-field-add" onClick={() => setPickerOpen(true)} disabled={!canAdd}>
          + Add image
        </button>
      </div>
      {pickerOpen && (
        <MediaPickerModal siteId={siteId} onSelect={handlePickerSelect} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
