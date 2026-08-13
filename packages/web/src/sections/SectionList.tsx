import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { AddIcon } from './AddIcon.tsx';
import { BlockList } from './BlockList.tsx';
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

interface SectionRowProps {
  section: Instance;
  sectionTypes: ThemeTypeSchemas;
  blockTypes: ThemeTypeSchemas;
  fieldErrors?: FieldErrorMap;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onChange: (section: Instance) => void;
  onEditInstance: (id: string) => void;
  onHighlightSection?: (id: string | null) => void;
  // Whether THIS row counts as highlighted right now - not just from
  // its own hover (handled locally via CSS :hover already), but also
  // from the reverse direction, where hovering the section in the
  // preview highlights this row despite the mouse never touching it.
  isHighlighted: boolean;
  // The instance currently open in the Fields panel (a section or a
  // block, anywhere in the tree) - threaded all the way down so a
  // selected block still gets its own blue background even nested
  // several BlockLists deep, not just at the top level.
  selectedInstanceId?: string | null;
  // Accordion state now lives one level up, in SectionList - so
  // opening one section's blocks can collapse every sibling's, which
  // a row managing its own local collapsed state could never do on
  // its own.
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// I4: a section's OWN acceptsBlocks flag (not a block's) decides
// whether its BlockList renders at all - "a section that does not
// support blocks shows no block controls" is enforced here, not left
// to BlockList itself (which always shows full controls once mounted).
// A section's own settings are edited via the Fields tab - clicking
// anywhere on the row (other than the chevron/remove/drag handle)
// opens it, per docs/design/Sections.png. Reordering is a real drag
// via the handle, not buttons - per the same design.
function SectionRow({
  section,
  sectionTypes,
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
  onHighlightSection,
  isHighlighted,
  selectedInstanceId,
  collapsed,
  onToggleCollapsed,
}: SectionRowProps) {
  const acceptsBlocks = sectionTypes.acceptsBlocks[section.type] === true;
  const isSelected = section.id === selectedInstanceId;
  const hasError = Boolean(fieldErrors?.[section.id] && Object.keys(fieldErrors[section.id] as object).length > 0);
  const displayName = schemaTitle(sectionTypes.schemas[section.type], section.type);
  const allowedTypes = allowedBlockTypes(sectionTypes.schemas[section.type]);

  function handleEdit(): void {
    onEditInstance(section.id);
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
        className={`instance-row-main${hasError ? ' has-error' : ''}${isHighlighted ? ' is-highlighted' : ''}${isSelected ? ' is-selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${displayName}${hasError ? ' (has an error)' : ''}`}
        onClick={handleEdit}
        onKeyDown={handleEditKeyDown}
        onMouseEnter={() => onHighlightSection?.(section.id)}
        onMouseLeave={() => onHighlightSection?.(null)}
      >
        {acceptsBlocks && (
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
        <button type="button" className="instance-row-remove" aria-label="Remove section" onClick={handleRemove}>
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
          <span className="instance-row-drag-handle-icon">
            <DragHandleIcon />
          </span>
        </span>
      </div>
      {acceptsBlocks && !collapsed && (
        <BlockList
          blocks={section.blocks ?? []}
          blockTypes={blockTypes}
          allowedTypes={allowedTypes}
          fieldErrors={fieldErrors}
          onChange={(blocks) => onChange({ ...section, blocks })}
          onEditInstance={onEditInstance}
          selectedInstanceId={selectedInstanceId}
        />
      )}
    </li>
  );
}

export interface SectionListProps {
  sections: Instance[];
  sectionTypes: ThemeTypeSchemas;
  blockTypes: ThemeTypeSchemas;
  fieldErrors?: FieldErrorMap;
  onChange: (sections: Instance[]) => void;
  onEditInstance: (id: string) => void;
  onHighlightSection?: (id: string | null) => void;
  highlightedSectionId?: string | null;
  selectedInstanceId?: string | null;
}

// I1: "editable, reorderable list" - drag the handle to reorder (a 4px
// blue line marks the active drop position), add (I2, sourced from the
// fetched theme schemas)/remove-with-confirm, plus a nested BlockList
// for section types that accept blocks (I4). A section's own settings
// are edited via the Fields tab (onEditInstance), not inline here.
export function SectionList({
  sections,
  sectionTypes,
  blockTypes,
  fieldErrors,
  onChange,
  onEditInstance,
  onHighlightSection,
  highlightedSectionId,
  selectedInstanceId,
}: SectionListProps) {
  const sectionTypeNames = Object.keys(sectionTypes.schemas);
  const { open: addMenuOpen, setOpen: setAddMenuOpen, openUpward, ref: addMenuRef, toggle: toggleAddMenu } = useAddMenu();
  const [draggedIndex, setDraggedIndexState] = useState<number | null>(null);
  const [dropIndex, setDropIndexState] = useState<number | null>(null);
  // Accordion, not independent per-row state - at most one top-level
  // section's own blocks are ever expanded at a time, so opening one
  // always closes whichever other one was open. Starts with none open
  // (every section with blocks starts collapsed, matching the previous
  // per-row default).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Expands the moment a section becomes the selected one, so its
  // blocks are visible without an extra manual chevron click - keyed
  // on the selection actually changing (not every render), so the
  // user can still collapse it again afterward without this snapping
  // it back open on the next unrelated re-render. Only reacts when the
  // selected instance IS one of these top-level sections - a selected
  // block nested inside one leaves expandedId alone, since that
  // section must already be expanded for the block to have been
  // clickable in the first place.
  useEffect(() => {
    if (selectedInstanceId !== null && sections.some((section) => section.id === selectedInstanceId)) {
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

  function removeSection(index: number): void {
    onChange(sections.filter((_, i) => i !== index));
  }

  function updateSection(index: number, updated: Instance): void {
    onChange(sections.map((section, i) => (i === index ? updated : section)));
  }

  function addSection(type: string): void {
    const acceptsBlocks = sectionTypes.acceptsBlocks[type] === true;
    const newSection: Instance = {
      id: crypto.randomUUID(),
      type,
      settings: buildDefaultSettings(sectionTypes.schemas[type]),
      ...(acceptsBlocks ? { blocks: [] } : {}),
    };
    onChange([...sections, newSection]);
    setAddMenuOpen(false);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(computeDropIndex(event.clientY, event.currentTarget.getBoundingClientRect(), index));
  }

  function handleDrop(): void {
    if (draggedIndexRef.current !== null && dropIndexRef.current !== null) {
      onChange(reorderList(sections, draggedIndexRef.current, dropIndexRef.current));
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
      <ul className="instance-list">
        {sections.map((section, index) => (
          <Fragment key={section.id}>
            {draggedIndex !== null && dropIndex === index && <li className="drop-indicator" aria-hidden="true" />}
            <SectionRow
              section={section}
              sectionTypes={sectionTypes}
              blockTypes={blockTypes}
              fieldErrors={fieldErrors}
              isDragging={draggedIndex === index}
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onRemove={() => removeSection(index)}
              onChange={(updated) => updateSection(index, updated)}
              onEditInstance={onEditInstance}
              onHighlightSection={onHighlightSection}
              isHighlighted={section.id === highlightedSectionId}
              selectedInstanceId={selectedInstanceId}
              collapsed={section.id !== expandedId}
              onToggleCollapsed={() => setExpandedId((current) => (current === section.id ? null : section.id))}
            />
          </Fragment>
        ))}
        {draggedIndex !== null && dropIndex === sections.length && (
          <li className="drop-indicator" aria-hidden="true" />
        )}
      </ul>
      {sectionTypeNames.length > 0 && (
        <div className="instance-add-menu-wrap" ref={addMenuRef}>
          {addMenuOpen && (
            <div className={`instance-add-menu${openUpward ? '' : ' instance-add-menu-below'}`} role="menu">
              {sectionTypeNames.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  className="instance-add-menu-item"
                  onClick={() => addSection(type)}
                >
                  {schemaTitle(sectionTypes.schemas[type], type)}
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
            Add Section
          </button>
        </div>
      )}
    </div>
  );
}
