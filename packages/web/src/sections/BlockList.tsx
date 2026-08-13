import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { AddIcon } from './AddIcon.tsx';
import { DragHandleIcon } from './DragHandleIcon.tsx';
import { TrashIcon } from './TrashIcon.tsx';
import { computeDropIndex, reorderList } from './drag-reorder.ts';
import {
  allowedBlockTypes,
  buildDefaultSettings,
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
}: BlockRowProps) {
  const acceptsNestedBlocks = blockTypes.acceptsBlocks[block.type] === true;
  const isSelected = block.id === selectedInstanceId;
  const hasError = Boolean(fieldErrors?.[block.id] && Object.keys(fieldErrors[block.id] as object).length > 0);
  const displayName = schemaTitle(blockTypes.schemas[block.type], block.type);
  const nestedAllowedTypes = allowedBlockTypes(blockTypes.schemas[block.type]);

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
    if (window.confirm(`Remove this "${displayName}" block? This cannot be undone.`)) {
      onRemove();
    }
  }

  function handleToggleCollapsed(event: React.MouseEvent): void {
    event.stopPropagation();
    onToggleCollapsed();
  }

  return (
    <li className={`instance-row${isDragging ? ' is-dragging' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div
        className={`instance-row-main${hasError ? ' has-error' : ''}${isSelected ? ' is-selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${displayName}${hasError ? ' (has an error)' : ''}`}
        onClick={handleEdit}
        onKeyDown={handleEditKeyDown}
      >
        {acceptsNestedBlocks && (
          <button
            type="button"
            className="instance-row-chevron"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            onClick={handleToggleCollapsed}
          >
            {collapsed ? '›' : '‹'}
          </button>
        )}
        <strong>{displayName}</strong>
        <button type="button" className="instance-row-remove" aria-label="Remove block" onClick={handleRemove}>
          <TrashIcon />
        </button>
        <span
          className="instance-row-drag-handle"
          draggable
          role="button"
          aria-label="Drag to reorder"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
          onDragStart={(event) => {
            event.stopPropagation();
            onDragStart();
          }}
          onDragEnd={(event) => {
            event.stopPropagation();
            onDragEnd();
          }}
        >
          <DragHandleIcon />
        </span>
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

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(computeDropIndex(event.clientY, event.currentTarget.getBoundingClientRect(), index));
  }

  function handleDrop(): void {
    if (draggedIndexRef.current !== null && dropIndexRef.current !== null) {
      onChange(reorderList(blocks, draggedIndexRef.current, dropIndexRef.current));
    }
    setDraggedIndex(null);
    setDropIndex(null);
  }

  function handleDragEnd(): void {
    setDraggedIndex(null);
    setDropIndex(null);
  }

  return (
    <div>
      <ul className="instance-list instance-list-nested">
        {blocks.map((block, index) => (
          <Fragment key={block.id}>
            {draggedIndex !== null && dropIndex === index && <li className="drop-indicator" aria-hidden="true" />}
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
            />
          </Fragment>
        ))}
        {draggedIndex !== null && dropIndex === blocks.length && <li className="drop-indicator" aria-hidden="true" />}
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
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            onClick={toggleAddMenu}
          >
            <AddIcon />
            Add Block
          </button>
        </div>
      )}
    </div>
  );
}
