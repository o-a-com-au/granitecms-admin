import { SectionList } from './SectionList.tsx';
import type { Instance } from './instance-types.ts';
import { buildFieldErrorMap, canEditAsSections, parsePage } from './page-content.ts';
import { useThemeSchemas } from './useThemeSchemas.ts';
import type { ValidationFieldError } from '../api/site-editor.ts';

export interface PageSectionsEditorProps {
  siteId: string;
  content: string;
  setContent: (value: string) => void;
  validationErrors: ValidationFieldError[] | null;
  onEditInstance: (id: string) => void;
  // Hovering a section row highlights the matching element in the
  // live preview iframe - owned by PageEditorPage (it holds the
  // iframe ref), just threaded through here to SectionList. The id
  // itself flows the other way too: hovering a section in the preview
  // sets this, so SectionList can highlight the matching row even
  // though the mouse was never actually over it.
  onHighlightSection?: (id: string | null) => void;
  highlightedSectionId?: string | null;
  selectedInstanceId?: string | null;
}

export { canEditAsSections };

// I1-I6: fetches the theme's schemas (siteId-scoped), parses the
// hook's raw content into a page object, and renders the Sections
// list. Selecting an instance (onEditInstance) no longer switches this
// component to a "Fields" view in place - the revised layout
// (docs/designs/Revised-Page-Edit--Section-Edit.png) shows the list
// and the fields form side by side, so field-editing is
// SectionFieldsPanel's own separate, independently-mounted component
// now, sharing this file's former parsing helpers via page-content.ts
// rather than living inside this one.
export function PageSectionsEditor({
  siteId,
  content,
  setContent,
  validationErrors,
  onEditInstance,
  onHighlightSection,
  highlightedSectionId,
  selectedInstanceId,
}: PageSectionsEditorProps) {
  const { themeSchemas, loadError } = useThemeSchemas(siteId);

  if (loadError) {
    return <p role="alert">{loadError}</p>;
  }
  if (!themeSchemas) {
    return <p>Loading theme...</p>;
  }

  const page = parsePage(content);
  if (!page) {
    return <p role="alert">This content can&apos;t be shown in the structured editor - switch to raw JSON to edit it.</p>;
  }

  const fieldErrors = buildFieldErrorMap(page.sections, validationErrors);
  const sectionTypes = { schemas: themeSchemas.sections, acceptsBlocks: themeSchemas.acceptsBlocks.sections };
  const blockTypes = { schemas: themeSchemas.blocks, acceptsBlocks: themeSchemas.acceptsBlocks.blocks };

  function updateSections(sections: Instance[]): void {
    setContent(JSON.stringify({ ...page, sections }, null, 2));
  }

  return (
    <div className="sections-panel">
      <h2 className="panel-heading">Sections</h2>
      <SectionList
        sections={page.sections}
        sectionTypes={sectionTypes}
        blockTypes={blockTypes}
        fieldErrors={fieldErrors}
        onChange={updateSections}
        onEditInstance={onEditInstance}
        onHighlightSection={onHighlightSection}
        highlightedSectionId={highlightedSectionId}
        selectedInstanceId={selectedInstanceId}
      />
    </div>
  );
}
