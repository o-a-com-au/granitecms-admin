import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { computeDropIndex, reorderList } from './drag-reorder.ts';
import { CloseIcon } from './CloseIcon.tsx';

export interface StringListFieldProps {
  value: unknown;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  labelledBy: string;
  onChange: (value: string[]) => void;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

interface ChipProps {
  text: string;
  index: number;
  isDragging: boolean;
  canRemove: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLSpanElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
}

// A tag-style chip, not a full instance-row: requested directly
// ("could the array field work more like a tag field... looks like a
// textarea box but with wrapped text that you can delete and drag"),
// after the first version (a vertical list of full-width rows, mirroring
// Sections/Blocks/Menu items) felt heavier than a handful of short
// strings warrants. The whole chip is the drag surface - no separate
// handle icon, unlike an instance-row - and the delete control is a
// small always-present "x", not a hover-reveal one, since a chip has no
// larger click target it would otherwise compete with (an instance-row
// needs the reveal-on-hover treatment specifically because clicking
// most of that row does something else - open the Fields tab - which a
// bare tag never does).
function Chip({ text, index, isDragging, canRemove, onDragStart, onDragOver, onDrop, onDragEnd, onRemove }: ChipProps) {
  return (
    <span
      className={`string-list-field-chip${isDragging ? ' is-dragging' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="string-list-field-chip-text">{text}</span>
      {canRemove && (
        <button type="button" className="string-list-field-chip-remove" aria-label={`Remove "${text || `line ${index + 1}`}"`} onClick={onRemove}>
          <CloseIcon />
        </button>
      )}
    </span>
  );
}

// SchemaField.tsx's own widget for `"type": "array", "items": { "type":
// "string" }` - a bordered box styled like a plain textarea, holding
// existing entries as wrapped, draggable, removable chips, with a
// separate text input + "Add" control beneath it for new entries
// (mirrors the requested mockup exactly: chips are add-once, not
// individually click-to-edit - fixing one means removing it and typing
// it again via the input below, the same trade-off a classic tag/email-
// recipient input already makes).
export function StringListField({ value, minItems, maxItems, minLength, maxLength, labelledBy, onChange }: StringListFieldProps) {
  const items = asStringArray(value);
  const [draftText, setDraftText] = useState('');
  const [draggedIndex, setDraggedIndexState] = useState<number | null>(null);
  // Unlike SectionList/BlockList/MenuItemList, there's no rendered drop-
  // indicator element here - a full-width "line between rows" doesn't
  // translate to a wrapping inline-chip flow (which row would it even
  // sit on?). The dragged chip's own reduced-opacity state is the only
  // visual feedback; the drop position itself only needs a ref, not a
  // second render-driving state value.
  const draggedIndexRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);

  function setDraggedIndex(index: number | null): void {
    draggedIndexRef.current = index;
    setDraggedIndexState(index);
  }

  // Reuses computeDropIndex's own gap maths unchanged, just fed the
  // horizontal axis (clientX / left+width) instead of the vertical one
  // SectionList/BlockList/MenuItemList use - the function itself is
  // purely "which side of this element's own midpoint is the pointer
  // on", agnostic to which axis that midpoint is measured along.
  function handleChipDragOver(event: DragEvent<HTMLSpanElement>, index: number): void {
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

  function commitDraft(): void {
    const text = draftText.trim();
    if (text === '' || !canAdd) {
      return;
    }
    if (typeof minLength === 'number' && text.length < minLength) {
      return;
    }
    onChange([...items, text]);
    setDraftText('');
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    }
  }

  return (
    <div className="string-list-field">
      <div className="string-list-field-box" role="group" aria-labelledby={labelledBy}>
        {items.map((text, index) => (
          <Chip
            key={index}
            text={text}
            index={index}
            isDragging={draggedIndex === index}
            canRemove={canRemove}
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => handleChipDragOver(event, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onRemove={() => onChange(items.filter((_, i) => i !== index))}
          />
        ))}
      </div>
      <div className="string-list-field-add-row">
        <input
          type="text"
          placeholder="New text here"
          aria-label="New line text"
          minLength={minLength}
          maxLength={maxLength}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          disabled={!canAdd}
        />
        <button type="button" onClick={commitDraft} disabled={!canAdd || draftText.trim() === ''}>
          Add
        </button>
      </div>
    </div>
  );
}
