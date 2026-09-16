import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { SearchInput } from '../components/SearchInput.tsx';
import { CloseIcon } from './CloseIcon.tsx';
import { schemaDescription, schemaIcon, schemaTitle, type ThemeTypeSchemas } from './instance-types.ts';
import { SectionTypeIcon } from './SectionTypeIcon.tsx';
import { iconNameForTitle } from './section-icon-name.ts';

export interface AddSectionModalProps {
  sectionTypes: ThemeTypeSchemas;
  onSelect: (type: string) => void;
  onClose: () => void;
}

// A centred picker listing one row per section type, sourced from the
// fetched theme schemas - the same source SectionList's old add-menu
// already read from. Rows rather than the previous grid of cards, and
// a narrower dialog matching NewPageModal's own proportions
// (requested directly, with a mockup).
//
// Each row carries an icon and an optional description, both read
// straight off the theme's own schema ("icon" and "description"
// keywords - see instance-types.ts). Neither needs agent support:
// theme schema JSON is passed through verbatim, exactly as the
// existing "title" and "allowedBlocks" keywords already are. A theme
// that declares neither still renders correctly - the icon falls back
// to SectionTypeIcon's own default and the description column is
// simply left empty.
//
// Portalled to document.body, same reasoning as MediaPickerModal's own
// portal: SectionList only ever renders inside the editor sidebar,
// which (like .editor-fields-panel) can sit inside a scrolling/
// transformed ancestor - .modal-overlay's fixed positioning has to
// resolve against the real viewport, not that ancestor's own box.
// No overlay-click-to-dismiss and no Escape handling, matching
// ConfirmDialog/MediaPickerModal's own established convention (an
// explicit close action only) rather than inventing a third pattern.
export function AddSectionModal({ sectionTypes, onSelect, onClose }: AddSectionModalProps) {
  const [query, setQuery] = useState('');
  // Titled first, so the search matches what's actually on screen (the
  // schema's own title, e.g. "FAQ") rather than only the raw type slug
  // a theme author never shows anywhere - a query like "media" should
  // still find a "Media + Text" section even though its type is
  // media-text, which substring-matching the slug alone would also
  // happen to catch, but by accident, not by design.
  // One id per modal instance, suffixed per row - useId returns a
  // single stable id, not one per list item, so the type slug does the
  // per-row part. Feeds each row's own aria-describedby below.
  const baseId = useId();
  // Picking a row selects it; the footer's Add button is what actually
  // adds it (requested directly, to match NewPageModal's own Cancel/
  // Create pair). Held as the type slug rather than an index so it
  // survives the list being filtered underneath it.
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const types = Object.keys(sectionTypes.schemas).map((type) => {
    const schema = sectionTypes.schemas[type];
    const title = schemaTitle(schema, type);
    return {
      type,
      title,
      description: schemaDescription(schema),
      // A theme's own "icon" keyword wins; otherwise the name is read
      // for a familiar word ("Quote", "Gallery", "Contact" and friends
      // - section-icon-name.ts) so a theme that declares nothing still
      // gets something better than one repeated default. Undefined
      // from both leaves SectionTypeIcon on its own fallback.
      icon: schemaIcon(schema) ?? iconNameForTitle(title),
    };
  });
  const normalisedQuery = query.trim().toLowerCase();
  const visibleTypes =
    normalisedQuery === '' ? types : types.filter(({ title }) => title.toLowerCase().includes(normalisedQuery));

  // A selection the current search has filtered out of view is treated
  // as no selection at all: leaving it live would let Add insert a
  // section the user can no longer see, which reads as the wrong thing
  // being added. Derived rather than cleared in an effect, so there is
  // no state to get out of step with the query.
  const selected = visibleTypes.some((entry) => entry.type === selectedType) ? selectedType : null;

  return createPortal(
    <div className="modal-overlay">
      {/* Three layers: the .dialog-header (heading and search on the
          panel toolbar's gradient), the one scrolling list, and a
          non-scrolling .dialog-footer carrying the same 50/50 Cancel/
          Add pair NewPageModal uses - all from dialog.css, so the two
          dialogs stay consistent by sharing rules rather than by
          matching values. */}
      <div className="add-section-modal" role="dialog" aria-modal="true" aria-labelledby="add-section-heading">
        <div className="dialog-header">
          <div className="dialog-header-title-row">
            <h2 id="add-section-heading">Add a Section</h2>
            <button type="button" className="dialog-header-close" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search sections" />
        </div>
        <div className="add-section-content">
          {visibleTypes.length === 0 && <p className="add-section-empty">No sections match &quot;{query}&quot;.</p>}
          {/* aria-label rather than letting the name be computed from
              the row's own contents: the visible description sits
              inside the button, so without this every button's
              accessible name would be "Title Description..." run
              together. The description is still announced, via
              aria-describedby. aria-pressed carries the selected state
              itself - the blue keyline is styled from that attribute,
              so the two can never disagree. */}
          <div className="add-section-list">
            {visibleTypes.map(({ type, title, description, icon }) => (
              <button
                key={type}
                type="button"
                className="add-section-item"
                aria-label={title}
                aria-pressed={selected === type}
                aria-describedby={description === undefined ? undefined : `${baseId}-${type}`}
                onClick={() => setSelectedType(type)}
              >
                <span className="add-section-item-icon">
                  <SectionTypeIcon name={icon} />
                </span>
                <span className="add-section-item-name">{title}</span>
                {description !== undefined && (
                  <span id={`${baseId}-${type}`} className="add-section-item-description">
                    {description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-footer">
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={selected === null}
              onClick={() => {
                if (selected !== null) {
                  onSelect(selected);
                }
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
