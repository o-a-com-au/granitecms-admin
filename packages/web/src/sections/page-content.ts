import type { FieldErrorMap, Instance } from './instance-types.ts';
import type { ValidationFieldError } from '../api/site-editor.ts';

export interface ParsedPage {
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

export function parsePage(content: string): ParsedPage | null {
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
export function buildFieldErrorMap(sections: Instance[], errors: ValidationFieldError[] | null): FieldErrorMap {
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
export function findInstance(
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
export function updateInstance(instances: Instance[], id: string, updater: (instance: Instance) => Instance): Instance[] {
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
