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
