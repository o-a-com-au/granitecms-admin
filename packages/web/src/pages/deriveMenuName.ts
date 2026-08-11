// listSiteContent's own type filter cannot find menus - entry.type is
// read from the content JSON's own "type" field, and a real menu file
// has none (menu.schema.json has no type property at all), so
// entry.type is always '' for every menu. Filtering by path prefix
// against the menusRoot-derived "menus/" path is the only reliable
// signal, confirmed directly against the agent's own content-listing
// service (three separately-walked roots - pages/posts/menus - all
// flattened to paths relative to contentRoot). Shared by MenusPage.tsx
// and ContentBrowserPage.tsx, not duplicated between them.
export function isMenuPath(path: string): boolean {
  return path.startsWith('menus/');
}

// Menus have no name/label field at all (menu.schema.json is
// {schemaVersion, items} only, additionalProperties: false) - the only
// identity a menu has is its filename. This derives a readable display
// name from it: "menus/footerCompany.json" -> "Footer Company".
export function deriveMenuName(path: string): string {
  const withoutPrefix = path.replace(/^menus\//, '');
  const withoutExtension = withoutPrefix.replace(/\.json$/, '');

  const words = withoutExtension
    .split(/[-_/]+/)
    .flatMap((segment) => segment.split(/(?=[A-Z])/))
    .filter((word) => word.length > 0);

  return words.map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}
