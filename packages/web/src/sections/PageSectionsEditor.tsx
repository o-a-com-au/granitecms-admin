import { useEffect, useState } from 'react';
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
  const isLoading = !themeSchemas && !loadError;

  // Most theme-schema fetches settle well within a second - showing the
  // skeleton immediately made every ordinary page open flash it for a
  // single frame, which read as noise rather than a genuine loading
  // state. Delaying it like this means it only ever appears for a
  // fetch that's actually slow enough to need it.
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false);
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), 1000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // The heading stays up regardless of what's still loading below it -
  // previously the whole panel (heading included) was replaced by a
  // bare loading/error message, which made the tab read as genuinely
  // empty rather than a Sections tab that's still fetching.
  if (loadError) {
    return (
      <div className="sections-panel">
        <h2 className="panel-heading">Sections</h2>
        <p role="alert">{loadError}</p>
      </div>
    );
  }
  if (!themeSchemas) {
    return (
      <div className="sections-panel">
        <h2 className="panel-heading">Sections</h2>
        {/* A single empty row shaped like a real section (instance-
            rows.css), not a text message - the shimmer is enough on its
            own to read as "still loading", without implying there's
            necessarily more than one section on the way. Held back by
            showSkeleton (above) until the fetch has genuinely been
            running for a second - nothing renders here at all before
            that, rather than swapping in some other placeholder. */}
        {showSkeleton && <div className="sections-skeleton-row" aria-hidden="true" />}
      </div>
    );
  }

  const page = parsePage(content);
  if (!page) {
    return (
      <div className="sections-panel">
        <h2 className="panel-heading">Sections</h2>
        <p role="alert">This content can&apos;t be shown in the structured editor - switch to raw JSON to edit it.</p>
      </div>
    );
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
