import { schemaTitle } from './instance-types.ts';
import { findInstance, parsePage } from './page-content.ts';
import { useThemeSchemas } from './useThemeSchemas.ts';

export interface SectionFieldsPanelHeaderProps {
  siteId: string;
  content: string;
  selectedInstanceId: string;
  onClose: () => void;
}

// Split out of SectionFieldsPanel.tsx so PageEditorPage.tsx can push
// this to its own useFieldsPanelHeader slot (PreviewContext.tsx),
// rendered by SharedPreviewRegion outside .editor-fields-panel's own
// scrolling body - the heading and its close button now stay visible
// while the form beneath them scrolls (requested directly).
//
// Independently derives its own title from siteId/content/
// selectedInstanceId rather than receiving it as a prop from
// SectionFieldsPanel - the same "each panel fetches its own copy"
// convention useThemeSchemas.ts already documents for Sections (left)
// vs Fields (right), extended to this header's own small slice of that
// same data rather than threading it through as a second value shape.
//
// The close button works immediately regardless of load state; the
// title itself is blank until the schema lookup actually resolves
// (themeSchemas fetched, page parsed, instance found) - no loading/
// error text of its own, since SectionFieldsPanel's own body already
// shows that in the one case that matters (a title merely being blank
// for a moment is unremarkable, unlike the body rendering nothing at
// all).
export function SectionFieldsPanelHeader({ siteId, content, selectedInstanceId, onClose }: SectionFieldsPanelHeaderProps) {
  const { themeSchemas } = useThemeSchemas(siteId);
  const page = parsePage(content);
  const found = page ? findInstance(page.sections, selectedInstanceId) : null;

  let title = '';
  if (themeSchemas && found) {
    const schemaSource = found.kind === 'section' ? themeSchemas.sections : themeSchemas.blocks;
    const schema = schemaSource[found.instance.type] as Record<string, unknown> | undefined;
    title = schemaTitle(schema, found.instance.type);
  }

  return (
    <div className="fields-panel-header">
      <h2 className="panel-heading">{title}</h2>
      <button type="button" className="fields-panel-close" aria-label="Close" onClick={onClose}>
        &times;
      </button>
    </div>
  );
}
