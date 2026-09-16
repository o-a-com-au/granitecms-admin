// A page's own content type is stored lowercase and shown capitalised.
//
// The split is not cosmetic fussiness: the agent stores this value
// verbatim and filters it with a plain, case-sensitive comparison
// (search/query-content.ts's own `f.page_type = ?`, no COLLATE
// NOCASE), so "Article" and "article" are two different types as far
// as a theme's own GET /search.json?pageType=... is concerned. Every
// page that exists today is lowercase. Storing what was typed would
// therefore let one stray capital silently drop a page out of the
// listing it belongs in, with nothing to see anywhere.
//
// Keeping both directions here, rather than inlining a toLowerCase at
// each call site, is what makes the round trip symmetric: a field that
// displays capitalised must normalise on the way back in, or it fights
// whatever the user types.

// What gets stored. Falls back to "page" rather than ever writing an
// empty string: "type" is required with minLength 1 in the agent's own
// page schema, so an empty value is content the site would reject.
export function normalisePageType(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? 'page' : trimmed;
}

// What gets shown. Only the first letter - a type is a single token
// ("article", "case-study"), not a sentence to title-case, and
// capitalising each word would turn "case-study" into "Case-Study",
// which is not what anyone typed.
export function displayPageType(value: string): string {
  return value === '' ? '' : value.charAt(0).toUpperCase() + value.slice(1);
}
