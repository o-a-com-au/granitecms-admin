import { Fragment, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { computeDropIndex, reorderList } from '../sections/drag-reorder.ts';
import { DragHandleIcon } from '../sections/DragHandleIcon.tsx';
import { EditIcon } from '../sections/EditIcon.tsx';
import { TrashIcon } from '../sections/TrashIcon.tsx';
import { InstanceRowActions } from '../sections/InstanceRowActions.tsx';
import type { MenuItem } from '../api/site-menus.ts';

interface MenuItemRowProps {
  item: MenuItem;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Mirrors BlockList.tsx's own BlockRow drag handle exactly (same
// handler shape, same drag-pill-via-portal technique) - a menu item's
// own reorder is genuinely the same interaction, just against a flat
// array with no nesting. No chevron/spacer at all, unlike Sections/
// Pages/Redirects/the menu row itself - an item never nests, and as a
// second-level instance-row it doesn't reserve that column the way a
// top-level row still does for cross-row alignment (requested
// directly).
function MenuItemRow({ item, isDragging, onDragStart, onDragOver, onDrop, onDragEnd, onEdit, onDelete }: MenuItemRowProps) {
  const dragPillRef = useRef<HTMLSpanElement>(null);
  const label = item.label || 'Untitled';

  return (
    <li className={`instance-row${isDragging ? ' is-dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="instance-row-main">
        <span
          className="instance-row-drag-handle"
          draggable
          role="button"
          aria-label={`Drag to reorder ${label}`}
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
        <span className="redirects-tab-row-label">
          <strong>{label}</strong>
        </span>
        <InstanceRowActions
          actions={[
            { key: 'edit', label: `Edit ${label}`, icon: <EditIcon />, onClick: onEdit },
            { key: 'delete', label: `Delete ${label}`, icon: <TrashIcon />, variant: 'destructive', onClick: onDelete },
          ]}
        />
        {createPortal(
          <span className="instance-row-drag-pill" ref={dragPillRef} aria-hidden="true">
            {label}
          </span>,
          document.body,
        )}
      </div>
    </li>
  );
}

export interface MenuItemListProps {
  items: MenuItem[];
  // Called with the whole reordered array on a completed drop that
  // actually moved something - MenuItemList only computes the new
  // order, it never saves anything itself, matching how add/edit/
  // delete all go through MenusTabPanel.tsx's own saveSiteMenuItems
  // call rather than each control owning its own network request.
  onReorder: (items: MenuItem[]) => void;
  onEdit: (index: number, item: MenuItem) => void;
  onDelete: (index: number, item: MenuItem) => void;
}

// Mirrors BlockList.tsx's own drag-and-drop implementation as closely
// as the two data shapes allow (same computeDropIndex/reorderList
// maths, same drop-indicator-line/container-dragover-catch-all
// technique) - requested directly ("we need the ability to reorder
// menu items"). Simpler than BlockList in two ways a menu item's own
// data shape rules out: no nesting (items never have children of
// their own), and no stable id to key a "just landed" fade-in
// animation off (menu.schema.json's items are additionalProperties:
// false - index is the only key available, same trade-off the plain
// item list already made) - reordering is instant with no landing
// animation rather than inventing a synthetic id.
export function MenuItemList({ items, onReorder, onEdit, onDelete }: MenuItemListProps) {
  const [draggedIndex, setDraggedIndexState] = useState<number | null>(null);
  const [dropIndex, setDropIndexState] = useState<number | null>(null);
  const ulRef = useRef<HTMLUListElement>(null);
  // Native dragover and drop can both fire within the same browser
  // tick, before React has re-rendered - handleDrop closing over the
  // *state* value of dropIndex would then read a stale (pre-dragover)
  // value. Worse, a drop on a row also bubbles to this list's own
  // onDrop (both are wired to handleDrop below), so handleDrop
  // genuinely runs twice per real drop - refs are updated
  // synchronously alongside the state (state still drives the visible
  // drop-indicator line), so the second, bubbled call reads
  // already-cleared refs and safely no-ops instead of reordering
  // twice. Mirrors BlockList.tsx's own identical setup exactly.
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

  // The blue drop-indicator line needs its own dragover/drop - see
  // BlockList.tsx's own version for the fuller reasoning, unchanged
  // here.
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
        onReorder(next);
      }
    }
    setDraggedIndex(null);
    setDropIndex(null);
  }

  function handleDragEnd(): void {
    setDraggedIndex(null);
    setDropIndex(null);
  }

  // Catches a pointer that's above the first row or below the last
  // one, still within the list itself - see BlockList.tsx's own
  // version for the fuller reasoning, unchanged here.
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

  return (
    <ul className="instance-list instance-list-nested" ref={ulRef} onDragOver={handleContainerDragOver} onDrop={handleDrop}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {draggedIndex !== null && dropIndex === index && (
            <li
              className="drop-indicator"
              aria-hidden="true"
              onDragOver={(event) => handleIndicatorDragOver(event, index)}
              onDrop={handleDrop}
            />
          )}
          <MenuItemRow
            item={item}
            isDragging={draggedIndex === index}
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => handleDragOver(event, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onEdit={() => onEdit(index, item)}
            onDelete={() => onDelete(index, item)}
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
  );
}
