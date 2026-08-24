// WordPress-style: lowercase, non-alphanumeric runs become a single
// hyphen, no leading/trailing hyphen. Deliberately simple (no unicode
// transliteration) - every real slug in this project's own demo
// content is plain ASCII, and a fancier transliteration table is
// speculative complexity nothing here has asked for. Shared by
// PageMetadataPanel.tsx's own slug-follows-Name behaviour and
// NewPageModal.tsx's title-to-path suggestion - the same rule either
// way, not two copies.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
