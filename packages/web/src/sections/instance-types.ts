// Shared by SectionList.tsx and BlockList.tsx - a section and a block
// are the same shape agent-side (instance.schema.json), and blocks
// can themselves nest blocks recursively.
export interface Instance {
  id: string;
  type: string;
  settings: Record<string, unknown>;
  blocks?: Instance[];
}

// I5: keyed by instance id, then by plain settings property name.
export type FieldErrorMap = Record<string, Record<string, string>>;

// The schema + acceptsBlocks data for one type family (sections or
// blocks) - what SectionList/BlockList need to render add-menus and
// decide whether to show nested block controls at all (I4).
export interface ThemeTypeSchemas {
  schemas: Record<string, object>;
  acceptsBlocks: Record<string, boolean>;
}

// I2/I3: the theme's own JSON Schema "title" keyword (e.g. hero.liquid's
// {% schema %} block), when the theme declares one - schemas is typed as
// a bare `object` (Group I's own deliberate choice, since the admin never
// needs to understand the rest of the shape), so this is the one place
// that reads into it. Falls back to the raw type slug, not a guessed/
// humanised name, for a theme authored before "title" existed - an
// absent title is a fact worth showing plainly, not papering over.
export function schemaTitle(schema: object | undefined, type: string): string {
  const title = (schema as { title?: unknown } | undefined)?.title;
  return typeof title === 'string' && title.trim() !== '' ? title : type;
}

// I2/K1: the theme's own optional "allowedBlocks" keyword (Group K),
// read the same way schemaTitle reads "title" - plain metadata on the
// schema object, not part of the settings shape it otherwise describes.
// Absent/malformed means unrestricted, matching a theme authored before
// this existed.
export function allowedBlockTypes(schema: object | undefined): string[] | undefined {
  const value = (schema as { allowedBlocks?: unknown } | undefined)?.allowedBlocks;
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

// I3: mirrors schemaTitle's own title-then-fallback shape, but the
// fallback deliberately differs - a field's own raw property name is
// camelCase (heading, codeTitle, posterImage), much harder to read as
// UI text than a type's own kebab-case slug, so an untitled field
// falls back to a humanised label (codeTitle -> "Code Title") rather
// than the raw key verbatim. A theme author can still override it with
// an explicit "title" on the property's own schema, same convention
// as schemaTitle.
export function fieldLabel(propertySchema: Record<string, unknown> | undefined, key: string): string {
  const title = propertySchema?.title;
  return typeof title === 'string' && title.trim() !== '' ? title : humanizeFieldKey(key);
}

// camelCase/snake_case/kebab-case -> "Title Case With Spaces". Not
// exported - fieldLabel is the one thing anything outside this file
// should ever call, so the raw-key transform stays swappable without
// hunting down every call site.
function humanizeFieldKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// L3: builds the initial settings for a freshly-added section/block from
// whatever "default" values its schema declares (standard JSON Schema
// keyword, not required-specific) - previously always {}, leaving any
// required field with no default genuinely invalid until the user filled
// it in by hand (Group I's own known gap). The agent now only registers
// a type at all once every required field has a valid default (Group L),
// so this closes the loop rather than just papering over it.
export function buildDefaultSettings(schema: object | undefined): Record<string, unknown> {
  const properties = (schema as { properties?: unknown } | undefined)?.properties;
  if (typeof properties !== 'object' || properties === null) {
    return {};
  }
  const settings: Record<string, unknown> = {};
  for (const [key, propertySchema] of Object.entries(properties as Record<string, unknown>)) {
    if (propertySchema && typeof propertySchema === 'object' && 'default' in propertySchema) {
      settings[key] = (propertySchema as { default: unknown }).default;
    }
  }
  return settings;
}
