import { createPortal } from 'react-dom';
import { schemaTitle, type ThemeTypeSchemas } from './instance-types.ts';

export interface AddSectionModalProps {
  sectionTypes: ThemeTypeSchemas;
  onSelect: (type: string) => void;
  onClose: () => void;
}

// Replaces the old context-menu-style "Add Section" dropdown with a
// centred grid picker (WordPress/Shopify-style), one card per type
// sourced from the fetched theme schemas - same source SectionList's
// old menu already read from, just presented as a grid instead of a
// list of plain text rows. Each card's thumb is a plain placeholder
// for now (no per-type artwork exists yet) - swappable later without
// touching this component's own structure, since the thumb is just a
// styled empty span, not something built around a real image url.
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
  const typeNames = Object.keys(sectionTypes.schemas);

  return createPortal(
    <div className="modal-overlay">
      <div className="add-section-modal" role="dialog" aria-modal="true" aria-labelledby="add-section-heading">
        <div className="add-section-modal-header">
          <h2 id="add-section-heading">Add a Section</h2>
          <button type="button" className="add-section-modal-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="add-section-grid">
          {typeNames.map((type) => (
            <button key={type} type="button" className="add-section-item" onClick={() => onSelect(type)}>
              <span className="add-section-item-thumb" aria-hidden="true" />
              <span className="add-section-item-name">{schemaTitle(sectionTypes.schemas[type], type)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
