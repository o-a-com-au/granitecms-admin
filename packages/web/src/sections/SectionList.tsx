import { Fragment, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AddIcon } from './AddIcon.tsx';
import { AddSectionModal } from './AddSectionModal.tsx';
import { BlockList } from './BlockList.tsx';
import { AccordionArrowIcon } from './AccordionArrowIcon.tsx';
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
  // A monotonically-incrementing token, not a plain boolean - a fresh
  // (non-zero) value every time THIS row is the one just dropped
  // (SectionList's own handleDrop), 0 the rest of the time. Has to be a
  // token rather than "is this the just-dropped row" so dragging the
  // very same row again immediately afterward still counts as a fresh
  // signal - a boolean that was already true wouldn't change value and
  // so wouldn't retrigger the effect below a second time in a row.
  justDroppedToken: number;
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
  justDroppedToken,
}: SectionRowProps) {
  const acceptsBlocks = sectionTypes.acceptsBlocks[section.type] === true;
  const isSelected = section.id === selectedInstanceId;
  const hasError = Boolean(fieldErrors?.[section.id] && Object.keys(fieldErrors[section.id] as object).length > 0);
  const displayName = schemaTitle(sectionTypes.schemas[section.type], section.type);
  const allowedTypes = allowedBlockTypes(sectionTypes.schemas[section.type]);

  // The floating name pill a real native drag shows pinned to the
  // cursor (instance-rows.css positions it off-screen at rest) -
  // native HTML5 drag-and-drop otherwise falls back to a browser
  // screenshot of whatever's draggable, which was just the small grip
  // icon itself. Needs a real element already in the DOM at the moment
  // dragstart fires (setDragImage can't render one from scratch), so
  // this is always rendered, not created on demand.
  //
  // Portaled to document.body, not rendered in place - .editor-sidebar
  // carries its own transform (its off-canvas slide-in), which makes it
  // the containing block for any plain position: fixed descendant, and
  // .editor-tab-content's overflow-y: auto sits between this row and
  // that ancestor - together those clipped this pill's "off-screen"
  // positioning away entirely rather than actually moving it off-
  // screen, so setDragImage was handed an element the browser never
  // painted at all. Found live: real drags stopped working outright
  // once the sidebar's own transform-based reveal shipped, not just a
  // cosmetic mispositioning. A portal escapes that ancestor chain
  // completely, so this is always positioned relative to the real
  // viewport regardless of what transforms/overflow the row itself
  // happens to be nested inside.
  const dragPillRef = useRef<HTMLSpanElement>(null);

  // Fades the row back in once it lands in its new position (0 means
  // "not this row" - see the justDroppedToken prop's own comment for
  // why a token, not a boolean).
  //
  // A real piece of state feeding into the className below, not an
  // imperative classList.add on a ref - found live: dropping onto some
  // gaps shifts which row ends up physically under the cursor, which
  // changes THAT row's isHighlighted a render or two after this one
  // fires. A class added by reaching into the DOM directly is invisible
  // to React's own reconciliation, so the next time this row's
  // className string gets recomputed for an unrelated reason (any
  // isHighlighted/isSelected/hasError change), React overwrites the
  // whole attribute with the freshly computed string and silently wipes
  // it back out - sometimes before the animation even gets a chance to
  // play. Keeping it in state instead means it's part of that same
  // string on every render, so it survives regardless of what else
  // changes.
  //
  // The two effects below still need the requestAnimationFrame "off,
  // then on next frame" step (not just isJustDropped(true) directly) -
  // this row can be dropped again before the CSS animation's own
  // duration has elapsed, and setting state to a value it's already at
  // wouldn't register as a change or restart anything.
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
    // Matches instance-rows.css's own instance-row-drop-fade-in
    // duration - long enough for the animation to finish before this
    // clears the class again.
    const timer = setTimeout(() => setIsJustDropped(false), 900);
    return () => clearTimeout(timer);
  }, [isJustDropped]);

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
        className={`instance-row-main${hasError ? ' has-error' : ''}${isHighlighted ? ' is-highlighted' : ''}${isSelected ? ' is-selected' : ''}${isJustDropped ? ' is-just-dropped' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${displayName}${hasError ? ' (has an error)' : ''}`}
        onClick={handleEdit}
        onKeyDown={handleEditKeyDown}
        onMouseEnter={() => onHighlightSection?.(section.id)}
        onMouseLeave={() => onHighlightSection?.(null)}
      >
        {acceptsBlocks ? (
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
        ) : (
          // Same box as the real button above, empty - so a section
          // with no blocks still reserves the arrow's column, and every
          // row's label lines up in the same place regardless of
          // whether that particular row has one.
          <span className="instance-row-chevron-spacer" aria-hidden="true" />
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
            event.dataTransfer.effectAllowed = 'move';
            if (dragPillRef.current) {
              // (0, 12): the pill's own left edge, not somewhere inside
              // it - the offset passed to setDragImage is the point
              // WITHIN the image that lines up with the cursor, so 0
              // means the whole pill renders to the right of the
              // cursor rather than centred underneath/on top of it.
              // Sitting on top of the cursor covered the very row
              // being hovered, which made it look like dragging over a
              // row wasn't doing anything (found live).
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
        {createPortal(
          <span className="instance-row-drag-pill" ref={dragPillRef} aria-hidden="true">
            {displayName}
          </span>,
          document.body,
        )}
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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [draggedIndex, setDraggedIndexState] = useState<number | null>(null);
  const [dropIndex, setDropIndexState] = useState<number | null>(null);
  // Which row just landed from a completed drag, and a fresh token each
  // time (see SectionRow's own justDroppedToken prop for why a plain
  // boolean/id isn't enough) - drives that row's fade-back-in.
  const [justDropped, setJustDropped] = useState<{ id: string; token: number } | null>(null);
  const dropTokenRef = useRef(0);
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

  // Drives .instance-list.is-dragging-active (below) a frame later than
  // draggedIndex itself, not in the same render - that padding shifts
  // every row's own position (it's added inside the list, above the
  // first row and below the last), and browsers cancel an in-progress
  // native drag outright if the dragged element (or its container)
  // shifts layout synchronously right as the drag starts. Found live:
  // adding the class in the very same commit as dragstart meant no
  // dragover ever fired again afterward - the browser had already
  // silently abandoned the whole gesture. One requestAnimationFrame is
  // enough for the browser to finish its own drag setup first.
  const [dragPaddingActive, setDragPaddingActive] = useState(false);
  useEffect(() => {
    if (draggedIndex === null) {
      setDragPaddingActive(false);
      return;
    }
    const frame = requestAnimationFrame(() => setDragPaddingActive(true));
    return () => cancelAnimationFrame(frame);
  }, [draggedIndex]);

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
    setAddModalOpen(false);
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(computeDropIndex(event.clientY, event.currentTarget.getBoundingClientRect(), index));
  }

  // The blue drop-indicator line itself needs its own dragover/drop -
  // it's a real element sitting exactly in the gap between two rows
  // (negative margin aside, it still has a genuine hit-box), so without
  // handlers of its own, a cursor that lands precisely on it never gets
  // preventDefault() called on it. Per the HTML5 drag-and-drop spec,
  // that silently rejects the drop the instant the pointer (or the
  // release) is over an element that never opted in, even though every
  // row around it does - found live: dropping right in the gap between
  // two rows failed outright, while dropping clearly inside either
  // row's own top or bottom half worked fine. No computeDropIndex call
  // needed here (unlike handleDragOver above) - the indicator already
  // sits at one exact, known position, not a row whose top/bottom half
  // still has to be worked out.
  function handleIndicatorDragOver(event: DragEvent<HTMLLIElement>, index: number): void {
    event.preventDefault();
    setDropIndex(index);
  }

  function handleDrop(): void {
    const fromIndex = draggedIndexRef.current;
    const toIndex = dropIndexRef.current;
    if (fromIndex !== null && toIndex !== null) {
      onChange(reorderList(sections, fromIndex, toIndex));
      // Same no-op check as reorderList's own (a drop into either gap
      // immediately next to the row's current position doesn't move it)
      // - skip the fade for a drop that didn't actually go anywhere.
      const droppedId = sections[fromIndex]?.id;
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
  // still within the list itself.
  //
  // Binding this to a wrapper *around* the list doesn't work - a real
  // browser only ever dispatches dragover to whatever element is
  // genuinely rendered under the cursor, and that wrapper's own box
  // never extended past the list's own top/bottom edges anyway (there
  // was nothing there to be "under" in the first place, just the flex
  // gap .sections-panel puts between the heading and the list - found
  // live, after a version attached to that wrapper passed in tests
  // that fire events directly at a target regardless of real layout,
  // yet still didn't work in the browser). instance-rows.css's own
  // .instance-list.is-dragging-active gives the list itself extra
  // padding for exactly as long as a drag is in progress, so there's
  // now a real part of ITS OWN box a pointer can genuinely be over
  // above the first row and below the last one - this is bound
  // directly to the list, not a separate ancestor, so it only ever
  // fires once the pointer is actually somewhere on that padding.
  //
  // event.target !== event.currentTarget is the "am I on empty space
  // inside the list, not a row" check - but that empty space isn't only
  // the padding above/below everything. .instance-list's own flex gap
  // between every pair of rows is ALSO not covered by either
  // neighbour's own box, so this fires there too, for any hover near a
  // row boundary, not just the very top/bottom of the list. Comparing
  // clientY against the LIST's own midpoint (an earlier version of this
  // fix) meant every one of those inter-row gaps snapped dropIndex to
  // 0 or sections.length depending only on which half of the WHOLE
  // list they happened to sit in - found live as the indicator
  // flickering between the correct spot and the very top/bottom while
  // hovering anywhere near a boundary between two rows. Comparing
  // against the FIRST and LAST row's own rects instead - not the
  // list's - means a gap between two ordinary rows in the middle
  // resolves to neither branch below and is correctly left alone,
  // since some more specific row/indicator dragover already set
  // dropIndex right before this bubbled up to here anyway.
  const ulRef = useRef<HTMLUListElement>(null);
  function handleContainerDragOver(event: DragEvent<HTMLUListElement>): void {
    if (draggedIndex === null || event.target !== event.currentTarget) {
      return;
    }
    // preventDefault() unconditionally from here down, not only inside
    // the two branches below - per the HTML5 drag-and-drop spec, a drop
    // only succeeds where the immediately preceding dragover called
    // preventDefault(), and this handler running AT ALL (the checks
    // above) already means the pointer is over empty space inside the
    // list with nothing else to have called it. Found live: releasing
    // directly in the flex gap between two ordinary rows silently
    // failed even though dropIndex still correctly held whatever the
    // row just above/below it had last set, because that specific
    // dragover (right here, over the gap) had never confirmed the
    // browser could drop there at all.
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
      setDropIndex(sections.length);
    }
  }

  return (
    <div>
      <ul
        className={`instance-list${dragPaddingActive ? ' is-dragging-active' : ''}`}
        ref={ulRef}
        onDragOver={handleContainerDragOver}
        onDrop={handleDrop}
      >
        {sections.map((section, index) => (
          <Fragment key={section.id}>
            {draggedIndex !== null && dropIndex === index && (
              <li
                className="drop-indicator"
                aria-hidden="true"
                onDragOver={(event) => handleIndicatorDragOver(event, index)}
                onDrop={handleDrop}
              />
            )}
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
              justDroppedToken={justDropped?.id === section.id ? justDropped.token : 0}
            />
          </Fragment>
        ))}
        {draggedIndex !== null && dropIndex === sections.length && (
          <li
            className="drop-indicator"
            aria-hidden="true"
            onDragOver={(event) => handleIndicatorDragOver(event, sections.length)}
            onDrop={handleDrop}
          />
        )}
      </ul>
      {sectionTypeNames.length > 0 && (
        // .instance-add-menu-wrap kept purely for its own margin-top -
        // no popover positioned against it any more (that's the old
        // dropdown's job, still needed by BlockList's own "Add Block"
        // button, which shares this same class), just reused here
        // rather than duplicating the same spacing rule under a new
        // name.
        <div className="instance-add-menu-wrap">
          <button type="button" className="instance-add-button" onClick={() => setAddModalOpen(true)}>
            <AddIcon />
            Add Section
          </button>
          {addModalOpen && (
            <AddSectionModal sectionTypes={sectionTypes} onSelect={addSection} onClose={() => setAddModalOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}
