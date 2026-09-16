// The Granite brand mark, used in the top bar and account popover
// (AppShell.tsx), the Settings shell header (SettingsLayout.tsx), and
// as the hero mark on Login and Signup - one component so a change to
// the mark lands in all five places at once.
//
// Fixed, baked-in per-shape fills, not currentColor, matching the
// source exactly. Inlined as fill="#hex" on each polygon rather than
// the source's shared <style class="cls-N"> block: a <style> block's
// class names are global to the document, so copying it as-is would
// risk colliding with any other icon that happens to reuse the same
// generated "cls-1" name (see icons/index.tsx's own comment on the
// same problem, for the same reason).
export function GraniteLogo() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true">
      {/* The three cube faces: lit top, blue left, shadowed right. */}
      <g>
        <polygon fill="#787878" points="92.54 25.52 50 .96 7.46 25.52 50 50.08 92.54 25.52" />
        <polygon fill="#3c6ef6" points="49.99 99.04 49.99 49.92 7.45 25.36 7.45 74.48 49.99 99.04" />
        <polygon fill="#565656" points="50.01 99.04 50.01 49.92 92.55 25.36 92.55 74.48 50.01 99.04" />
      </g>
      {/* Four strata lines scored across the two lower faces, two per
          side, replacing the nested inner cube this mark used to
          carry. Drawn after the faces, so they sit on top of them. */}
      <polygon fill="#424242" points="49.93 67.21 49.93 65.12 7.39 40.56 7.39 42.65 49.93 67.21" />
      <polygon fill="#424242" points="49.93 83.49 49.93 81.41 7.39 56.85 7.39 58.93 49.93 83.49" />
      <polygon fill="#424242" points="50.01 67.21 50.01 65.12 92.55 40.56 92.55 42.65 50.01 67.21" />
      <polygon fill="#424242" points="50.01 83.49 50.01 81.41 92.55 56.85 92.55 58.93 50.01 83.49" />
    </svg>
  );
}
