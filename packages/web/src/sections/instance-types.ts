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
