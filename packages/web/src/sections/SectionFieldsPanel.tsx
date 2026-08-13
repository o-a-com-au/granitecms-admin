import { SectionSettingsForm } from './SectionSettingsForm.tsx';
import { schemaTitle, type Instance } from './instance-types.ts';
import { buildFieldErrorMap, findInstance, parsePage, removeInstance, updateInstance } from './page-content.ts';
import { useThemeSchemas } from './useThemeSchemas.ts';
import type { ValidationFieldError } from '../api/site-editor.ts';

export interface SectionFieldsPanelProps {
  siteId: string;
  content: string;
  setContent: (value: string) => void;
  validationErrors: ValidationFieldError[] | null;
  selectedInstanceId: string;
  onClose: () => void;
}

// The right-hand slide-in panel (docs/designs/Revised-Page-Edit--
// Section-Edit.png) - PageEditorPage only ever mounts this once
// something is selected (selectedInstanceId is a plain string prop
// here, not string | null, since the parent already gates on that),
// and unmounts it on close rather than this component rendering an
// empty/placeholder state itself. Sibling to PageSectionsEditor, not a
// mode of it any more - see that file's own comment for why they
// split.
export function SectionFieldsPanel({
  siteId,
  content,
  setContent,
  validationErrors,
  selectedInstanceId,
  onClose,
}: SectionFieldsPanelProps) {
  const { themeSchemas, loadError } = useThemeSchemas(siteId);

  if (loadError) {
    return <p role="alert">{loadError}</p>;
  }
  if (!themeSchemas) {
    return <p>Loading theme...</p>;
  }

  const page = parsePage(content);
  if (!page) {
    return null;
  }

  const found = findInstance(page.sections, selectedInstanceId);
  if (!found) {
    return null;
  }

  const { instance, kind } = found;
  const sectionTypes = { schemas: themeSchemas.sections, acceptsBlocks: themeSchemas.acceptsBlocks.sections };
  const blockTypes = { schemas: themeSchemas.blocks, acceptsBlocks: themeSchemas.acceptsBlocks.blocks };
  const schemaSource = kind === 'section' ? sectionTypes.schemas : blockTypes.schemas;
  const schema = schemaSource[instance.type] as Record<string, unknown> | undefined;
  const fieldErrors = buildFieldErrorMap(page.sections, validationErrors);

  function updateSections(sections: Instance[]): void {
    setContent(JSON.stringify({ ...page, sections }, null, 2));
  }

  // Same immediate removal (no confirmation) as SectionList/BlockList's
  // own trash icon - this is just a second way to reach the exact same
  // action, not a different one. Closes the panel afterward, since it
  // would otherwise keep showing fields for an instance that no longer
  // exists in the content. pageSections, not page.sections directly -
  // TS's null-narrowing of page (via the guard above) doesn't reach
  // into a hoisted function declaration like this one, only into
  // expressions (e.g. the inline onChange below) already in scope at
  // their own point of definition.
  const pageSections = page.sections;
  function handleDelete(): void {
    updateSections(removeInstance(pageSections, instance.id));
    onClose();
  }

  return (
    <div className="fields-panel">
      <div className="fields-panel-header">
        <h2 className="panel-heading">{schemaTitle(schema, instance.type)}</h2>
        <button type="button" className="fields-panel-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
      </div>
      <SectionSettingsForm
        schema={schema}
        settings={instance.settings}
        fieldErrors={fieldErrors[instance.id]}
        onChange={(settings) =>
          updateSections(updateInstance(page.sections, instance.id, (found2) => ({ ...found2, settings })))
        }
      />
      <button type="button" className="fields-panel-delete" onClick={handleDelete}>
        {kind === 'section' ? 'Delete Section' : 'Delete Block'}
      </button>
    </div>
  );
}
