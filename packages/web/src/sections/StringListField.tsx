import { Fragment, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { computeDropIndex, reorderList } from './drag-reorder.ts';
import { AddIcon } from './AddIcon.tsx';
import { DragHandleIcon } from './DragHandleIcon.tsx';
import { TrashIcon } from './TrashIcon.tsx';
import { InstanceRowActions } from './InstanceRowActions.tsx';

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

interface StringListRowProps {
  text: string;
  index: number;
  isDragging: boolean;
  minLength?: number;
  maxLength?: number;
  canRemove: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onTextChange: (text: string) => void;
  onRemove: () => void;
}

// Mirrors MenuItemList.tsx's own MenuItemRow (same drag handle shape,
// same drag-pill-via-portal technique) - the one real difference is
// that a row's own text is edited inline via a real <input>, not a
// separate edit modal, since there's nothing else about a plain string
// worth a whole modal for.
function StringListRow({
  text,
  index,
  isDragging,
  minLength,
  maxLength,
  canRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onTextChange,
  onRemove,
}: StringListRowProps) {
  const dragPillRef = useRef<HTMLSpanElement>(null);
  const rowLabel = text || `Line ${index + 1}`;

  return (
    <li className={`instance-row${isDragging ? ' is-dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="instance-row-main string-list-field-row">
        <span
          className="instance-row-drag-handle"
          draggable
          role="button"
          aria-label={`Drag to reorder ${rowLabel}`}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            if (dragPillRef.current) {
              // (0, 12) - see SectionList.tsx's own SectionRow for why
              // 0, not a value inside the pill.
              event.dataTransfer.setDragImage(dragPillRef.current, 0, 12);
            }
            onDragStart();
          }}
          onDragEnd={(event) => {
            event.stopPropagation();
            onDragEnd();
          }}
        >
          <span className="instance-row-drag-handle-icon">
            <DragHandleIcon />
          </span>
        </span>
        <input
          type="text"
          className="string-list-field-input"
          aria-label={`Line ${index + 1}`}
          minLength={minLength}
          maxLength={maxLength}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
        />
        {canRemove && (
          <InstanceRowActions
            actions={[
              {
                key: 'remove',
                label: `Remove line ${index + 1}`,
                icon: <TrashIcon />,
                variant: 'destructive',
                onClick: onRemove,
              },
            ]}
          />
        )}
        {createPortal(
          <span className="instance-row-drag-pill" ref={dragPillRef} aria-hidden="true">
            {rowLabel}
          </span>,
          document.body,
        )}
      </div>
    </li>
  );
}

// SchemaField.tsx's own widget for `"type": "array", "items": { "type":
// "string" }` - a repeatable list of plain text lines (add/remove/drag
// to reorder), the same interaction every other repeatable list in
// this app already uses (SectionList/BlockList/MenuItemList), reusing
// their shared row chrome and the same computeDropIndex/reorderList
// maths rather than inventing a new drag-and-drop implementation.
// Deliberately no per-row local id: each row's <input> is fully
// controlled straight off `value[index]` (same as the plain string
// branch in SchemaField.tsx itself), and reordering the array plus
// keying by index is the same trade-off MenuItemList.tsx's own comment
// already documents for label/url pairs - plain strings have no
// identity of their own either.
export function StringListField({ value, minItems, maxItems, minLength, maxLength, labelledBy, onChange }: StringListFieldProps) {
  const items = asStringArray(value);
  const [draggedIndex, setDraggedIndexState] = useState<number | null>(null);
  const [dropIndex, setDropIndexState] = useState<number | null>(null);
  const ulRef = useRef<HTMLUListElement>(null);
  // See MenuItemList.tsx's own identical pair for why refs are kept
  // alongside state - a drop can fire its handler twice (once on the
  // row, once bubbled to the list), and the second, already-cleared-ref
  // call must safely no-op rather than reordering twice.
  const draggedIndexRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);

  function setDraggedIndex(index: number | null): void {
    draggedIndexRef.current = index;
    setDraggedIndexState(index);
  }

  function setDropIndex(index: number | null): void {
    dropIndexRef.current = index;
    setDropIndexState(index);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(computeDropIndex(event.clientY, event.currentTarget.getBoundingClientRect(), index));
  }

  function handleIndicatorDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(index);
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
    setDropIndex(null);
  }

  function handleDragEnd(): void {
    setDraggedIndex(null);
    setDropIndex(null);
  }

  function handleContainerDragOver(event: DragEvent<HTMLUListElement>): void {
    if (draggedIndex === null || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    const rows = ulRef.current?.querySelectorAll(':scope > .instance-row');
    if (!rows || rows.length === 0) {
      return;
    }
    const firstRow = rows[0] as Element;
    const lastRow = rows[rows.length - 1] as Element;
    if (event.clientY < firstRow.getBoundingClientRect().top) {
      setDropIndex(0);
    } else if (event.clientY > lastRow.getBoundingClientRect().bottom) {
      setDropIndex(items.length);
    }
  }

  const canAdd = maxItems === undefined || items.length < maxItems;
  const canRemove = minItems === undefined || items.length > minItems;

  return (
    <div className="string-list-field" role="group" aria-labelledby={labelledBy}>
      <ul className="instance-list" ref={ulRef} onDragOver={handleContainerDragOver} onDrop={handleDrop}>
        {items.map((text, index) => (
          <Fragment key={index}>
            {draggedIndex !== null && dropIndex === index && (
              <li
                className="drop-indicator"
                aria-hidden="true"
                onDragOver={(event) => handleIndicatorDragOver(event, index)}
                onDrop={handleDrop}
              />
            )}
            <StringListRow
              text={text}
              index={index}
              isDragging={draggedIndex === index}
              minLength={minLength}
              maxLength={maxLength}
              canRemove={canRemove}
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onTextChange={(text) => onChange(items.map((existing, i) => (i === index ? text : existing)))}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          </Fragment>
        ))}
        {draggedIndex !== null && dropIndex === items.length && (
          <li
            className="drop-indicator"
            aria-hidden="true"
            onDragOver={(event) => handleIndicatorDragOver(event, items.length)}
            onDrop={handleDrop}
          />
        )}
      </ul>
      <button type="button" className="instance-add-button" onClick={() => onChange([...items, ''])} disabled={!canAdd}>
        <AddIcon />
        Add line
      </button>
    </div>
  );
}
