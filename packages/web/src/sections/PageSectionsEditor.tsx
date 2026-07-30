import { useEffect, useState } from 'react';
import { SectionList } from './SectionList.tsx';
import type { FieldErrorMap, Instance } from './instance-types.ts';
import { fetchSiteThemeSchemas, type ThemeSchemas } from '../api/site-theme-schemas.ts';
import type { ValidationFieldError } from '../api/site-editor.ts';

export interface PageSectionsEditorProps {
  siteId: string;
  content: string;
  setContent: (value: string) => void;
  validationErrors: ValidationFieldError[] | null;
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
// so each SectionSettingsForm/BlockRow only ever looks up its own id,
// never re-parses a path string itself.
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

// I1-I6: the composition root. Fetches the theme's schemas once
// (siteId-scoped), parses the hook's raw content into a page object,
// and renders title/published (the two page-level fields this pass
// gives structured controls to - everything else stays editable only
// via the raw JSON fallback) plus the section list.
export function PageSectionsEditor({ siteId, content, setContent, validationErrors }: PageSectionsEditorProps) {
  const [themeSchemas, setThemeSchemas] = useState<ThemeSchemas | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  function updateSections(sections: Instance[]): void {
    setContent(JSON.stringify({ ...page, sections }, null, 2));
  }

  return (
    <div>
      <label>
        Title
        <input
          type="text"
          value={typeof page.title === 'string' ? page.title : ''}
          onChange={(event) => setContent(JSON.stringify({ ...page, title: event.target.value }, null, 2))}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(page.published)}
          onChange={(event) => setContent(JSON.stringify({ ...page, published: event.target.checked }, null, 2))}
        />
        Published
      </label>
      <SectionList
        sections={page.sections}
        sectionTypes={{ schemas: themeSchemas.sections, acceptsBlocks: themeSchemas.acceptsBlocks.sections }}
        blockTypes={{ schemas: themeSchemas.blocks, acceptsBlocks: themeSchemas.acceptsBlocks.blocks }}
        fieldErrors={fieldErrors}
        onChange={updateSections}
      />
    </div>
  );
}
