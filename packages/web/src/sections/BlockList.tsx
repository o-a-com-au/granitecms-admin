import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AccordionArrowIcon } from './AccordionArrowIcon.tsx';
import { AddIcon } from './AddIcon.tsx';
import { DragHandleIcon } from './DragHandleIcon.tsx';
import { TrashIcon } from './TrashIcon.tsx';
import { computeDropIndex, reorderList } from './drag-reorder.ts';
import {
  allowedBlockTypes,
  buildDefaultSettings,
  dataDrivenLabel,
  schemaTitle,
  type FieldErrorMap,
  type Instance,
  type ThemeTypeSchemas,
} from './instance-types.ts';
import { useAddMenu } from './useAddMenu.ts';

interface BlockRowProps {
  block: Instance;
  blockTypes: ThemeTypeSchemas;
  fieldErrors?: FieldErrorMap;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onChange: (block: Instance) => void;
  onEditInstance: (id: string) => void;
  selectedInstanceId?: string | null;
  // Accordion state lives one level up, in BlockList - see SectionList
  // for the same pattern at the top level.
  collapsed: boolean;
  onToggleCollapsed: () => void;
  // A monotonically-incrementing token, not a plain boolean - see
  // SectionList.tsx's own SectionRow for the fuller reasoning
  // (0 = not this row; a fresh non-zero value each time this one is
  // the block that just landed from a completed drag).
  justDroppedToken: number;
}

// I4: nested blocks (a block that itself accepts blocks - e.g. a
// "group" block whose whole purpose is nesting others) reuse this
// exact same BlockList recursively, one level per acceptsBlocks=true.
// A block's own settings are edited via the Fields tab - clicking
// anywhere on the row (other than the chevron/remove/drag handle)
// opens it, per docs/design/Sections.png. Reordering is a real drag
// via the handle, not buttons - per the same design.
function BlockRow({
  block,
  blockTypes,
  fieldErrors,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onRemove,
  onChange,
  onEditInstance,
  selectedInstanceId,
  collapsed,
  onToggleCollapsed,
  justDroppedToken,
}: BlockRowProps) {
  const acceptsNestedBlocks = blockTypes.acceptsBlocks[block.type] === true;
  const isSelected = block.id === selectedInstanceId;
  const hasError = Boolean(fieldErrors?.[block.id] && Object.keys(fieldErrors[block.id] as object).length > 0);
  // Requested directly: a block's own row label prefers real data over
  // its generic type name, so several same-type blocks in one list
  // (e.g. five "Logo Mark" blocks) read as distinct at a glance instead
  // of all showing the identical title - see dataDrivenLabel's own
  // comment for the exact priority order. Falls back to the type's own
  // title (schemaTitle) when nothing in settings matches.
  const displayName = dataDrivenLabel(block.settings) ?? schemaTitle(blockTypes.schemas[block.type], block.type);
  const nestedAllowedTypes = allowedBlockTypes(blockTypes.schemas[block.type]);

  // The floating name pill a real native drag shows pinned to the
  // cursor (instance-rows.css positions it off-screen at rest) - see
  // SectionList.tsx's own SectionRow for the fuller reasoning, unchanged
  // here.
  const dragPillRef = useRef<HTMLSpanElement>(null);

  // Fades the row back in once it lands in its new position - a real
  // piece of state feeding into the className below, not an imperative
  // classList.add on a ref. See SectionList.tsx's own SectionRow for
  // the fuller reasoning (found live: an unrelated isHighlighted change
  // on the same row, from the reorder itself shifting which row ends up
  // under the cursor, silently wiped a classList-only class before the
  // animation could finish).
  const [isJustDropped, setIsJustDropped] = useState(false);
  useEffect(() => {
    if (justDroppedToken === 0) {
      return;
    }
    setIsJustDropped(false);
    const frame = requestAnimationFrame(() => setIsJustDropped(true));
    return () => cancelAnimationFrame(frame);
  }, [justDroppedToken]);

  useEffect(() => {
    if (!isJustDropped) {
      return;
    }
    const timer = setTimeout(() => setIsJustDropped(false), 900);
    return () => clearTimeout(timer);
  }, [isJustDropped]);

  function handleEdit(): void {
    onEditInstance(block.id);
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleEdit();
    }
  }

  function handleRemove(event: React.MouseEvent): void {
    event.stopPropagation();
    onRemove();
  }

  function handleToggleCollapsed(event: React.MouseEvent): void {
    event.stopPropagation();
    onToggleCollapsed();
  }

  return (
    <li className={`instance-row${isDragging ? ' is-dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div
        className={`instance-row-main${hasError ? ' has-error' : ''}${isSelected ? ' is-selected' : ''}${isJustDropped ? ' is-just-dropped' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${displayName}${hasError ? ' (has an error)' : ''}`}
        onClick={handleEdit}
        onKeyDown={handleEditKeyDown}
      >
        {/* Absolutely positioned within .instance-row-main's own
            reserved left padding (instance-rows.css) - DOM order no
            longer matters for its own layout, but it's kept first here
            to match reading/tab order with where it visually sits. */}
        <span
          className="instance-row-drag-handle"
          draggable
          role="button"
          aria-label="Drag to reorder"
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
        {/* No spacer for a block that doesn't accept nested blocks -
            unlike Sections/Pages (top-level rows, where a mix of
            chevron/no-chevron siblings share one list and need to
            align), a block is a second-level instance-row and never
            reserves this column at all when unused (requested directly
            - collapses the same way the drag handle now does when
            absent). */}
        {acceptsNestedBlocks && (
          <button
            type="button"
            className="instance-row-chevron"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            onClick={handleToggleCollapsed}
          >
            <span className={`instance-row-chevron-icon${collapsed ? '' : ' is-expanded'}`}>
              <AccordionArrowIcon />
            </span>
          </button>
        )}
        <strong title={displayName}>{displayName}</strong>
        <button type="button" className="instance-row-remove" aria-label="Remove block" onClick={handleRemove}>
          <TrashIcon />
        </button>
        {createPortal(
          <span className="instance-row-drag-pill" ref={dragPillRef} aria-hidden="true">
            {displayName}
          </span>,
          document.body,
        )}
      </div>
      {acceptsNestedBlocks && !collapsed && (
        <BlockList
          blocks={block.blocks ?? []}
          blockTypes={blockTypes}
          allowedTypes={nestedAllowedTypes}
          fieldErrors={fieldErrors}
          onChange={(blocks) => onChange({ ...block, blocks })}
          onEditInstance={onEditInstance}
          selectedInstanceId={selectedInstanceId}
        />
      )}
    </li>
  );
}

export interface BlockListProps {
  blocks: Instance[];
  blockTypes: ThemeTypeSchemas;
  // K4: restricts the Add Block menu to these types, per the parent
  // section/block's own declared allowedBlocks - undefined means
  // unrestricted (every declared block type), today's behaviour.
  allowedTypes?: string[];
  fieldErrors?: FieldErrorMap;
  onChange: (blocks: Instance[]) => void;
  onEditInstance: (id: string) => void;
  selectedInstanceId?: string | null;
}

// I1, I4: drag the handle to reorder (a 4px blue line marks the
// active drop position), add/remove. A block's own settings are
// edited via the Fields tab (onEditInstance), not inline here - this
// is purely the structural/reorder view. Whether this component
// renders at ALL for a given section/block is the caller's decision
// (I4's "shows no block controls") - once rendered, it always shows
// full controls.
export function BlockList({
  blocks,
  blockTypes,
  allowedTypes,
  fieldErrors,
  onChange,
  onEditInstance,
  selectedInstanceId,
}: BlockListProps) {
  const blockTypeNames = allowedTypes
    ? Object.keys(blockTypes.schemas).filter((type) => allowedTypes.includes(type))
    : Object.keys(blockTypes.schemas);
  const { open: addMenuOpen, setOpen: setAddMenuOpen, openUpward, ref: addMenuRef, toggle: toggleAddMenu } = useAddMenu();
  const [draggedIndex, setDraggedIndexState] = useState<number | null>(null);
  const [dropIndex, setDropIndexState] = useState<number | null>(null);
  // Which row just landed from a completed drag, and a fresh token each
  // time - see SectionList.tsx's own version of the same state.
  const [justDropped, setJustDropped] = useState<{ id: string; token: number } | null>(null);
  const dropTokenRef = useRef(0);
  // Accordion, scoped to this one BlockList instance - see
  // SectionList's own version of the same pattern. Each nesting level
  // (a section's own blocks, a block's own nested blocks) is a
  // separate BlockList instance with its own independent state, so
  // expanding one doesn't collapse an unrelated sibling list elsewhere
  // in the tree.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedInstanceId !== null && blocks.some((block) => block.id === selectedInstanceId)) {
      setExpandedId(selectedInstanceId ?? null);
    }
  }, [selectedInstanceId]);
  // Native dragover and drop can both fire within the same browser
  // tick, before React has re-rendered - handleDrop closing over the
  // *state* value of dropIndex would then read a stale (pre-dragover)
  // value. Refs are updated synchronously alongside the state (state
  // still drives the visible drop-indicator line), so handleDrop
  // always sees exactly what the most recent dragover computed.
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

  // Drives .instance-list.is-dragging-active a frame later than
  // draggedIndex itself - see SectionList.tsx's own version for the
  // fuller reasoning (a same-commit layout shift right as a native drag
  // starts gets the whole gesture silently cancelled by the browser).
  const [dragPaddingActive, setDragPaddingActive] = useState(false);
  useEffect(() => {
    if (draggedIndex === null) {
      setDragPaddingActive(false);
      return;
    }
    const frame = requestAnimationFrame(() => setDragPaddingActive(true));
    return () => cancelAnimationFrame(frame);
  }, [draggedIndex]);

  function removeBlock(index: number): void {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function updateBlock(index: number, updated: Instance): void {
    onChange(blocks.map((block, i) => (i === index ? updated : block)));
  }

  // I2: sourced from the fetched theme schemas, not a hardcoded list.
  function addBlock(type: string): void {
    const acceptsNested = blockTypes.acceptsBlocks[type] === true;
    const newBlock: Instance = {
      id: crypto.randomUUID(),
      type,
      settings: buildDefaultSettings(blockTypes.schemas[type]),
      ...(acceptsNested ? { blocks: [] } : {}),
    };
    onChange([...blocks, newBlock]);
    setAddMenuOpen(false);
  }

  // A picker with exactly one option is just an extra click for no
  // real choice - skips straight to adding it instead of opening a
  // menu with a single, forced item.
  function handleAddButtonClick(): void {
    if (blockTypeNames.length === 1) {
      addBlock(blockTypeNames[0] as string);
      return;
    }
    toggleAddMenu();
  }

  // Same reasoning as the click-skips-the-menu behaviour above - once
  // there's only one real choice, "Add Block" is a needless extra
  // word: the button already names the one thing it does (requested
  // directly, e.g. "Add Button" instead of "Add Block" when Button is
  // the only allowed type here). Falls back to the generic label the
  // moment there's an actual choice to present.
  const addButtonLabel =
    blockTypeNames.length === 1
      ? `Add ${schemaTitle(blockTypes.schemas[blockTypeNames[0] as string], blockTypeNames[0] as string)}`
      : 'Add Block';

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(computeDropIndex(event.clientY, event.currentTarget.getBoundingClientRect(), index));
  }

  // The blue drop-indicator line needs its own dragover/drop - see
  // SectionList.tsx's own version for the fuller reasoning, unchanged
  // here.
  function handleIndicatorDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(index);
  }

  function handleDrop(): void {
    const fromIndex = draggedIndexRef.current;
    const toIndex = dropIndexRef.current;
    if (fromIndex !== null && toIndex !== null) {
      onChange(reorderList(blocks, fromIndex, toIndex));
      // Same no-op check as reorderList's own - skip the fade for a
      // drop that didn't actually move anything.
      const droppedId = blocks[fromIndex]?.id;
      if (droppedId !== undefined && toIndex !== fromIndex && toIndex !== fromIndex + 1) {
        dropTokenRef.current += 1;
        setJustDropped({ id: droppedId, token: dropTokenRef.current });
      }
    }
    setDraggedIndex(null);
    setDropIndex(null);
  }

  function handleDragEnd(): void {
    setDraggedIndex(null);
    setDropIndex(null);
  }

  // Catches a pointer that's above the first row or below the last one,
  // still within the list itself - see SectionList.tsx's own version
  // for the fuller reasoning, unchanged here.
  const ulRef = useRef<HTMLUListElement>(null);
  function handleContainerDragOver(event: DragEvent<HTMLUListElement>): void {
    if (draggedIndex === null || event.target !== event.currentTarget) {
      return;
    }
    // Compared against the first/last row's own rects, not the list's
    // own midpoint - see SectionList.tsx's own version for why (the
    // list's flex gap between every pair of rows is ALSO "empty" space
    // this handler's target check alone can't tell apart from the
    // padding above/below everything, so comparing against the whole
    // list's midpoint snapped every inter-row gap to 0 or blocks.length
    // - found live as the indicator flickering near any row boundary).
    //
    // preventDefault() unconditionally, not only inside the two
    // branches below - see SectionList.tsx's own version for why
    // (releasing directly in an ordinary gap between two rows otherwise
    // silently fails, since the browser only allows a drop where the
    // immediately preceding dragover confirmed it).
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
      setDropIndex(blocks.length);
    }
  }

  return (
    <div>
      <ul
        className={`instance-list instance-list-nested${dragPaddingActive ? ' is-dragging-active' : ''}`}
        ref={ulRef}
        onDragOver={handleContainerDragOver}
        onDrop={handleDrop}
      >
        {blocks.map((block, index) => (
          <Fragment key={block.id}>
            {draggedIndex !== null && dropIndex === index && (
              <li
                className="drop-indicator"
                aria-hidden="true"
                onDragOver={(event) => handleIndicatorDragOver(event, index)}
                onDrop={handleDrop}
              />
            )}
            <BlockRow
              block={block}
              blockTypes={blockTypes}
              fieldErrors={fieldErrors}
              isDragging={draggedIndex === index}
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onRemove={() => removeBlock(index)}
              onChange={(updated) => updateBlock(index, updated)}
              onEditInstance={onEditInstance}
              selectedInstanceId={selectedInstanceId}
              collapsed={block.id !== expandedId}
              onToggleCollapsed={() => setExpandedId((current) => (current === block.id ? null : block.id))}
              justDroppedToken={justDropped?.id === block.id ? justDropped.token : 0}
            />
          </Fragment>
        ))}
        {draggedIndex !== null && dropIndex === blocks.length && (
          <li
            className="drop-indicator"
            aria-hidden="true"
            onDragOver={(event) => handleIndicatorDragOver(event, blocks.length)}
            onDrop={handleDrop}
          />
        )}
      </ul>
      {blockTypeNames.length > 0 && (
        <div className="instance-add-menu-wrap" ref={addMenuRef}>
          {addMenuOpen && (
            <div className={`instance-add-menu${openUpward ? '' : ' instance-add-menu-below'}`} role="menu">
              {blockTypeNames.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  className="instance-add-menu-item"
                  onClick={() => addBlock(type)}
                >
                  {schemaTitle(blockTypes.schemas[type], type)}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="instance-add-button"
            aria-haspopup={blockTypeNames.length === 1 ? undefined : 'menu'}
            aria-expanded={blockTypeNames.length === 1 ? undefined : addMenuOpen}
            onClick={handleAddButtonClick}
          >
            <AddIcon />
            {addButtonLabel}
          </button>
        </div>
      )}
    </div>
  );
}
