// RichTextField.tsx's own toolbar icons - hand-drawn currentColor SVGs,
// matching TrashIcon.tsx's convention (width/height: 100%, no fixed
// pixel size - actual size comes from the wrapping CSS box) rather
// than the big Figma-sourced IconSprite set in icons/index.tsx, since
// no design asset exists for any of these. Bold/Italic/Paragraph/H1-3
// are plain styled text glyphs in RichTextField.tsx itself, not SVGs
// here - "B", "I", "¶", "H1" etc. are already self-explanatory as
// text, so only the three genuinely pictographic actions (Link,
// Bullet list, Numbered list) get a drawn icon.

export function LinkIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 12a2.5 2.5 0 0 1 0-3.54l1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M12 4a2.5 2.5 0 0 1 0 3.54l-1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M6.5 9.5l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function BulletListIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="2" cy="4" r="1" fill="currentColor" />
      <circle cx="2" cy="8" r="1" fill="currentColor" />
      <circle cx="2" cy="12" r="1" fill="currentColor" />
      <line x1="5.5" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.5" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.5" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function NumberedListIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 16 16" aria-hidden="true">
      <text x="0.5" y="5.4" fontSize="4.2" fill="currentColor">
        1
      </text>
      <text x="0.5" y="9.4" fontSize="4.2" fill="currentColor">
        2
      </text>
      <text x="0.5" y="13.4" fontSize="4.2" fill="currentColor">
        3
      </text>
      <line x1="5.5" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.5" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.5" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
