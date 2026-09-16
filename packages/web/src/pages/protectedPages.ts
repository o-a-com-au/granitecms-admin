// pages/index.json and pages/404.json are not ordinary rows: both are
// hardcoded in the agent's own renderer (public.ts resolves '/' to
// index.json, and any unmatched route falls back to rendering
// 404.json), so the admin has to treat them as fixed points rather than
// as pages like any other.
//
// The two are NOT equally fragile, and that difference is what decides
// how hard each one is guarded here:
//
// - Losing index.json - deleted, set back to a draft, renamed, or
//   dragged under another page - makes the site's own root serve a 404.
//   There is no fallback for it: handlePublicRequest simply finds no
//   page and calls sendNotFound. Nothing in the admin looks wrong
//   afterwards either, since the tree still lists every other page, so
//   the first report of it tends to come from a visitor.
// - Losing 404.json only degrades. sendNotFound catches ANY failure
//   while rendering it (missing, unpublished, or its own theme broken)
//   and falls back to a plain JSON error body - ugly, not broken, and
//   deliberately so: see the agent's guide-content-authoring.md.
//
// So Home blocks its destructive actions outright, and 404 is allowed
// but says what will happen.
export const HOME_PAGE_PATH = 'pages/index.json';
export const NOT_FOUND_PAGE_PATH = 'pages/404.json';

// Excluded as parent options (requested directly). Nesting under Home
// would produce pages/index/<slug>.json, which resolves at
// /index/<slug> rather than the /<slug> anyone choosing "Home" would
// expect - a URL that silently isn't what was asked for - and nesting
// under 404 would produce /404/<slug>, which is meaningless.
//
// Lives here rather than in NewPageModal.tsx, where it started: it is
// the same "these two paths are special" rule the guards below apply,
// and the page tree needs it as much as the dialog does.
export const NON_PARENT_PAGE_PATHS = [HOME_PAGE_PATH, NOT_FOUND_PAGE_PATH];

export function isHomePage(path: string): boolean {
  return path === HOME_PAGE_PATH;
}

export function isNotFoundPage(path: string): boolean {
  return path === NOT_FOUND_PAGE_PATH;
}

export function isProtectedPage(path: string): boolean {
  return isHomePage(path) || isNotFoundPage(path);
}

// Publishing is deliberately never guarded - it is not the dangerous
// direction. If Home has somehow ended up as a draft, publishing it is
// the fix, so removing that action would take away the way back out.
// Only the flip towards draft is blocked.
export function canSetAsDraft(path: string): boolean {
  return !isHomePage(path);
}

// Deleting Home has no undo from the site's point of view: the root
// stops resolving. Deleting 404.json is allowed (the renderer copes),
// but the confirmation says so.
export function canDeletePage(path: string): boolean {
  return !isHomePage(path);
}

// Renaming or moving either page removes it from the exact path its
// renderer looks for, with no fallback and nothing in the UI to show
// for it afterwards - so both are blocked for both pages, unlike
// delete and draft, which only block Home.
export function canChangePagePath(path: string): boolean {
  return !isProtectedPage(path);
}

// The sentence appended to a confirmation for an action that is allowed
// on 404.json but worth understanding first. Null for anything else, so
// a caller can append it unconditionally.
export function notFoundPageWarning(path: string): string | null {
  return isNotFoundPage(path)
    ? ' This is the site\'s own 404 page: without it, a missing url falls back to a plain error message instead of a designed page.'
    : null;
}
