// Picks an icon for a section type from the words in its displayed
// name, for the common case where a theme has not declared an explicit
// "icon" keyword of its own (requested directly, with these exact
// rules). A theme's own "icon" always wins - this is the guess made
// when there is nothing to go on but the name.
//
// Ordered, first match wins: a name can contain more than one of these
// words, and the order below is the order the rules were given in.
// Worth knowing: "Media + Text" matches "text" before "media", so it
// resolves to text-align-justify rather than image. Reorder these
// entries to change that - the precedence lives here and nowhere else.
//
// Matching is case-insensitive substring, so "FAQ" and "FAQs" both hit
// the "faq" rule, and "Featured work" hits "feature".
const RULES: ReadonlyArray<readonly [needle: string, icon: string]> = [
  ['text', 'text-align-justify'],
  ['list', 'list'],
  ['quote', 'quote'],
  ['statement', 'quote'],
  ['contact', 'form'],
  ['form', 'form'],
  ['faq', 'message-circle-question-mark'],
  ['question', 'message-circle-question-mark'],
  ['hero', 'star'],
  ['feature', 'star'],
  ['banner', 'flag'],
  ['image', 'image'],
  ['media', 'image'],
  ['video', 'play'],
  ['gallery', 'layout-panel-top'],
];

// Undefined when no rule matches, rather than a default of its own -
// SectionTypeIcon already owns what "no icon" falls back to, and
// having two places decide that would let them drift apart.
export function iconNameForTitle(title: string): string | undefined {
  const haystack = title.toLowerCase();
  return RULES.find(([needle]) => haystack.includes(needle))?.[1];
}

// Exported for the test that pins every rule's icon to one the icon
// component actually bundles - a rule naming an unbundled icon would
// silently fall back to the default, which is exactly the kind of
// quiet mismatch this pairing is meant to prevent.
export const ICON_RULE_TARGETS = RULES.map(([, icon]) => icon);
