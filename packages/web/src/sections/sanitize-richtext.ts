import DOMPurify from 'dompurify';

// The one allow-list for every richtext field in the app - matches the
// toolbar's own seven actions (Paragraph/H1/H2/H3, Bold, Italic, Link,
// Bullet list, Numbered list) exactly, plus <br> for a soft Shift+Enter
// line break (not in the toolbar itself, but silently eating a line
// break a user actually typed would be a confusing bug, and a bare
// <br> carries no attributes to sanitize). Not `as const` - DOMPurify's
// own Config type wants a mutable string[], not a readonly tuple.
const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'br'];

// href is the only attribute any allowed tag legitimately carries.
// DOMPurify's ALLOWED_ATTR is a single global list, not scoped per tag
// - harmless here since nothing else in ALLOWED_TAGS would plausibly
// carry href regardless. DOMPurify's default ALLOWED_URI_REGEXP
// already blocks javascript: hrefs, so no override needed there.
const ALLOWED_ATTR = ['href'];

// The one function every richtext write path (typing, paste, the
// value-prop sync effect) must go through before HTML from a
// contentEditable region is trusted - it's eventually rendered raw on
// a real site via Liquid, so this is the only thing standing between a
// pasted <script>/onclick/style attribute and a stored-XSS hole. This
// is admin-UI-only: a direct call to the agent's own /v1/ API bypasses
// this entirely, which is a separate, agent-repo-side hardening
// question, not solved here.
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

// execCommand('bold'/'italic') is non-standard and some browsers
// produce <b>/<i> rather than <strong>/<em> - called on the live
// contentEditable element (not a serialised string - a regex rename on
// raw HTML text is exactly the kind of fragile parsing this whole
// module exists to avoid) before sanitizeRichText runs, so a user's
// own just-applied formatting isn't immediately stripped by the very
// next sanitize pass (ALLOWED_TAGS only recognises strong/em, not
// b/i). Mutates root in place, same as the DOM it's walking.
export function normalizeLegacyTags(root: HTMLElement): void {
  renameAll(root, 'b', 'strong');
  renameAll(root, 'i', 'em');
}

function renameAll(root: HTMLElement, from: string, to: string): void {
  root.querySelectorAll(from).forEach((el) => {
    const replacement = document.createElement(to);
    replacement.append(...Array.from(el.childNodes));
    el.replaceWith(replacement);
  });
}
