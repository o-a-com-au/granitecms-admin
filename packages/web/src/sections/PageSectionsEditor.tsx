import { useEffect, useState } from 'react';
import { SectionList } from './SectionList.tsx';
import { SectionSettingsForm } from './SectionSettingsForm.tsx';
import { schemaTitle, type FieldErrorMap, type Instance } from './instance-types.ts';
import { fetchSiteThemeSchemas, type ThemeSchemas } from '../api/site-theme-schemas.ts';
import type { ValidationFieldError } from '../api/site-editor.ts';

export interface PageSectionsEditorProps {
  siteId: string;
  content: string;
  setContent: (value: string) => void;
  validationErrors: ValidationFieldError[] | null;
  // 'list' is the Sections tab (structure/reorder only); 'fields' is
  // the Fields tab, which only ever shows once onEditInstance has
  // fired at least once - PageEditorPage owns which is active.
  view: 'list' | 'fields';
  onEditInstance: (id: string) => void;
  // Hovering a section row highlights the matching element in the
  // live preview iframe - owned by PageEditorPage (it holds the
  // iframe ref), just threaded through here to SectionList. The id
  // itself flows the other way too: hovering a section in the preview
  // sets this, so SectionList can highlight the matching row even
  // though the mouse was never actually over it.
  onHighlightSection?: (id: string | null) => void;
  highlightedSectionId?: string | null;
}

interface ParsedPage {
  title?: unknown;
  published?: unknown;
  sections: Instance[];
  [key: string]: unknown;
}

// I6: this is the ENTIRE mechanism connecting structured edits to the
// same autosave/ETag/conflict path Group E already built - parse the
// hook's own raw content, mutate a plain object, stringify it back,
// call the hook's own setContent. No second save mechanism exists.
// Used by PageEditorPage to decide whether the structured view is even
// an option for the current content - content with no sections array
// (e.g. a menu, or a post that predates this group) always falls back
// to the raw view, regardless of which tab was last selected.
export function canEditAsSections(content: string): boolean {
  return parsePage(content) !== null;
}

function parsePage(content: string): ParsedPage | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.sections)) {
      return null;
    }
    return record as ParsedPage;
  } catch {
    return null;
  }
}

// I5: the agent's real errors are flat paths like
// /sections/0/settings/heading (or, recursively,
// /sections/0/blocks/1/settings/label) - re-keyed by instance id here
// so the Fields view only ever looks up its own selected instance's
// id, never re-parses a path string itself.
function buildFieldErrorMap(sections: Instance[], errors: ValidationFieldError[] | null): FieldErrorMap {
  const map: FieldErrorMap = {};
  if (!errors) {
    return map;
  }
  const fieldErrors = errors;

  function walk(instances: Instance[], prefix: string): void {
    instances.forEach((instance, index) => {
      const instancePrefix = `${prefix}/${index}`;
      const settingsPrefix = `${instancePrefix}/settings/`;
      for (const error of fieldErrors) {
        if (error.path.startsWith(settingsPrefix)) {
          const key = error.path.slice(settingsPrefix.length);
          map[instance.id] = { ...map[instance.id], [key]: error.message };
        }
      }
      if (instance.blocks) {
        walk(instance.blocks, `${instancePrefix}/blocks`);
      }
    });
  }

  walk(sections, '/sections');
  return map;
}

// A section is only ever found at the top level; a block can be
// nested arbitrarily deep under other blocks that accept blocks -
// which schema family applies (sections vs blocks) depends entirely
// on WHERE an id is found, not on any flag carried by the instance
// itself.
function findInstance(
  sections: Instance[],
  id: string,
): { instance: Instance; kind: 'section' | 'block' } | null {
  for (const section of sections) {
    if (section.id === id) {
      return { instance: section, kind: 'section' };
    }
    if (section.blocks) {
      const found = findBlockInstance(section.blocks, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function findBlockInstance(blocks: Instance[], id: string): { instance: Instance; kind: 'block' } | null {
  for (const block of blocks) {
    if (block.id === id) {
      return { instance: block, kind: 'block' };
    }
    if (block.blocks) {
      const found = findBlockInstance(block.blocks, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

// Mirrors findInstance's own recursive shape, replacing exactly the
// one instance with a matching id wherever it sits in the tree.
function updateInstance(instances: Instance[], id: string, updater: (instance: Instance) => Instance): Instance[] {
  return instances.map((instance) => {
    if (instance.id === id) {
      return updater(instance);
    }
    if (instance.blocks) {
      return { ...instance, blocks: updateInstance(instance.blocks, id, updater) };
    }
    return instance;
  });
}

// I1-I6: the composition root. Fetches the theme's schemas once
// (siteId-scoped), parses the hook's raw content into a page object,
// and renders either the Sections list (just the section list now -
// Title and Published both live on the Metafields tab, via
// PageMetadataPanel) or, once something has been selected, the Fields
// view for that one instance.
export function PageSectionsEditor({
  siteId,
  content,
  setContent,
  validationErrors,
  view,
  onEditInstance,
  onHighlightSection,
  highlightedSectionId,
}: PageSectionsEditorProps) {
  const [themeSchemas, setThemeSchemas] = useState<ThemeSchemas | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setThemeSchemas(null);
    setLoadError(null);

    fetchSiteThemeSchemas(siteId)
      .then((schemas) => {
        if (!cancelled) {
          setThemeSchemas(schemas);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load the theme schemas');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteId]);

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

  function handleEditInstance(id: string): void {
    setSelectedInstanceId(id);
    onEditInstance(id);
  }

  if (view === 'fields') {
    const found = selectedInstanceId ? findInstance(page.sections, selectedInstanceId) : null;
    if (!found) {
      return <p>Choose a section or block from the Sections tab to edit its fields.</p>;
    }
    const { instance, kind } = found;
    const schemaSource = kind === 'section' ? sectionTypes.schemas : blockTypes.schemas;
    const schema = schemaSource[instance.type] as Record<string, unknown> | undefined;
    return (
      <div className="fields-panel">
        <h2 className="panel-heading">{schemaTitle(schema, instance.type)}</h2>
        <SectionSettingsForm
          schema={schema}
          settings={instance.settings}
          fieldErrors={fieldErrors[instance.id]}
          onChange={(settings) =>
            updateSections(updateInstance(page.sections, instance.id, (found2) => ({ ...found2, settings })))
          }
        />
      </div>
    );
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
        onEditInstance={handleEditInstance}
        onHighlightSection={onHighlightSection}
        highlightedSectionId={highlightedSectionId}
      />
    </div>
  );
}
