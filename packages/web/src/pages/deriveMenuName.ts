// listSiteContent's own type filter cannot find menus - entry.type is
// read from the content JSON's own "type" field, and a real menu file
// has none (menu.schema.json has no type property at all), so
// entry.type is always '' for every menu. Filtering by path prefix
// against the menusRoot-derived "menus/" path is the only reliable
// signal, confirmed directly against the agent's own content-listing
// service (two separately-walked roots - pages/menus - both flattened
// to paths relative to contentRoot). Shared by MenusPage.tsx
// and ContentBrowserPage.tsx, not duplicated between them.
export function isMenuPath(path: string): boolean {
  return path.startsWith('menus/');
}

// A menu's own optional "name" (content schema 7+) wins when set -
// see menuDisplayName below. Without one, the only identity a menu has
// is its filename, and this derives a readable display name from it:
// "menus/footerCompany.json" -> "Footer Company".
export function deriveMenuName(path: string): string {
  const withoutPrefix = path.replace(/^menus\//, '');
  const withoutExtension = withoutPrefix.replace(/\.json$/, '');

  const words = withoutExtension
    .split(/[-_/]+/)
    .flatMap((segment) => segment.split(/(?=[A-Z])/))
    .filter((word) => word.length > 0);

  return words.map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// What every menu row, dialog and commit message should call a menu:
// its own display name when it has one, otherwise the filename-derived
// one above. The filename itself never changes on a rename - layouts
// reference a menu by it (menus.<filename>.items).
export function menuDisplayName(menu: { path: string; name: string | null }): string {
  return menu.name ?? deriveMenuName(menu.path);
}

// Content schema 7 is the first agent version whose menu.schema.json
// accepts "name". An older agent rejects the whole save
// (additionalProperties: false), so naming is only offered once the
// site reports it can store one.
export const MENU_NAME_SCHEMA_VERSION = 7;
