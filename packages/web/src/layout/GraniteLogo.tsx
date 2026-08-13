// The Granite brand mark (docs/designs/granite-logo.svg), used once in
// the top bar (AppShell.tsx) - fixed, baked-in per-shape fills, not
// currentColor, matching the source exactly. Inlined as fill="#hex" on
// each polygon rather than the source's shared <style class="cls-N">
// block: a <style> block's class names are global to the document, so
// copying it as-is would risk colliding with any other icon that
// happens to reuse the same generated "cls-1" name (see icons/
// index.tsx's own comment on the same problem, for the same reason).
export function GraniteLogo() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
      <g>
        <polygon fill="#787878" points="92.54 25.52 50 .96 7.46 25.52 50 50.08 92.54 25.52" />
        <polygon fill="#3c6ef6" points="49.99 99.04 49.99 49.92 7.45 25.36 7.45 74.48 49.99 99.04" />
        <polygon fill="#565656" points="50.01 99.04 50.01 49.92 92.55 25.36 92.55 74.48 50.01 99.04" />
      </g>
      <g>
        <polygon fill="#939393" points="75.9 35.09 50 20.13 24.09 35.09 50 50.05 75.9 35.09" />
        <polygon fill="#6b8af1" points="49.99 79.87 49.99 49.95 24.09 34.99 24.09 64.91 49.99 79.87" />
        <polygon fill="#787878" points="50.01 79.87 50.01 49.95 75.91 34.99 75.91 64.91 50.01 79.87" />
      </g>
    </svg>
  );
}
