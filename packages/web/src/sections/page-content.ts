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
// id, never re-parses a path string itself. A nested/object-shaped
// field (e.g. the image field's own focalX/focalY) produces a longer
// path like .../settings/image/focalX - collapsed to just the first
// segment ("image") below, so it lands on the parent field's own error
// slot rather than a key nothing ever looks up. Known, accepted
// limitation: two distinct errors under the same nested parent (e.g.
// both focalX and focalY invalid at once) collapse to one map entry,
// last-processed-wins - every real schema's own nested object today
// (just the image field) is small enough that showing one of the two
// messages is still useful, not silently blank.
// Ajv's own wording for these two keywords ("must NOT have fewer than
// 1 characters", "must have required property 'url'") is developer-
// facing jargon, not something to show a content editor. Every real
// minLength in this project's own theme schemas today is 1 (a plain
// non-empty-string requirement, e.g. the image field's own nested
// url) - so collapsing both keywords to one plain message is accurate
// for every real case, not just a guess. Every other keyword (pattern,
// minimum/maximum, enum, etc.) keeps Ajv's own message untouched -
// only these two have a real, seen-in-practice wording problem.
function friendlyFieldErrorMessage(error: ValidationFieldError): string {
  if (error.keyword === 'minLength' || error.keyword === 'required') {
    return 'This field is required.';
  }
  return error.message;
}

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
          const key = error.path.slice(settingsPrefix.length).split('/')[0] ?? '';
          map[instance.id] = { ...map[instance.id], [key]: friendlyFieldErrorMessage(error) };
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

// Same recursive shape again, this time dropping exactly the one
// instance with a matching id wherever it sits in the tree - used by
// SectionFieldsPanel's own "Delete Section"/"Delete Block" link, the
// same removal SectionList/BlockList's own trash icon already does,
// just reachable from inside the Fields panel too (the only way to
// delete at all on mobile, where that icon is hidden - no rollover to
// reveal it there).
export function removeInstance(instances: Instance[], id: string): Instance[] {
  return instances
    .filter((instance) => instance.id !== id)
    .map((instance) => (instance.blocks ? { ...instance, blocks: removeInstance(instance.blocks, id) } : instance));
}
