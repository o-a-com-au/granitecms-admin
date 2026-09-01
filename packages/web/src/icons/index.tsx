// The admin's second icon set (docs/design/Icons/*.svg) - unlike
// AppShell's original nav icons, these ship with fixed, baked-in fill
// colours per shape rather than a single currentColor stroke, so they
// can't shift colour on hover/active via CSS the way the old ones did
// (the designs express "active" as a background box around the icon
// instead - see .nav-rail-item[aria-current] etc. in styles.css).
//
// Colours are inlined as fill="#hex" on each shape, not a shared
// <style class="cls-N"> block copied from the source SVGs - <style>
// blocks aren't scoped per <symbol>/<use> instance, so two icons that
// happened to reuse the same generated class name (e.g. both "cls-1")
// but different colours would collide. Inlined fills sidestep that,
// and remain correct through <use> too: <use> clones the referenced
// subtree with its own attributes intact, so per-shape fills aren't
// affected by not being the "chosen" colour source the way a bare
// currentColor icon would be.
//
// Every icon is defined once as a <symbol> in IconSprite below (the
// "master include" - one hidden <svg>, mounted once at the app root
// in AppShell.tsx) and referenced everywhere else via
// <use href="#icon-x">, rather than each call site re-rendering its
// own copy of the same path data. Plain href, not xlink:href - the
// SVG2 attribute, supported by every browser this app targets;
// xlink:href is the older SVG1.1 form kept around only for legacy
// rendering engines this project has no need to support.
//
// Every icon component renders svg width/height="100%" with no size
// props of its own - actual size always comes from whatever CSS box
// wraps it (.nav-rail-icon, .tab-icon, .device-icon), in rem rather
// than a fixed pixel default. viewBox stays square (0 0 64 64) on
// both the <symbol> and its wrapping <svg>, so a square container
// always scales the whole icon uniformly with no distortion.

// Not rendered visibly itself - mounted once (AppShell.tsx) so every
// <use> elsewhere in the document can resolve its href. Positioned
// off-screen at zero size rather than display: none, since some
// browsers fail to resolve <use> references into a display: none
// ancestor.
export function IconSprite() {
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <symbol id="icon-menus" viewBox="0 0 64 64">
        <rect fill="#757575" x="17.47" y="22.03" width="39.97" height="8.56" rx="2.51" ry="2.51" />
        <path fill="#c4c4c4" d="M19.97,10.44h34.96c1.11,0,2.01.9,2.01,2.01v3.55c0,1.11-.9,2.01-2.01,2.01H19.97c-1.11,0-2.01-.9-2.01-2.01v-3.55c0-1.11.9-2.01,2.01-2.01Z" />
        <path
          fill="#fff"
          d="M54.94,10.94c.83,0,1.51.68,1.51,1.51v3.55c0,.83-.68,1.51-1.51,1.51H19.97c-.83,0-1.51-.68-1.51-1.51v-3.55c0-.83.68-1.51,1.51-1.51h34.96ZM54.94,9.94H19.97c-1.38,0-2.51,1.12-2.51,2.51v3.55c0,1.38,1.12,2.51,2.51,2.51h34.96c1.38,0,2.51-1.12,2.51-2.51v-3.55c0-1.38-1.12-2.51-2.51-2.51h0Z"
        />
        <rect fill="#717171" x="17.88" y="34.11" width="31.56" height="8.56" rx="2.42" ry="2.42" />
        <rect fill="#757575" x="17.47" y="46.2" width="39.97" height="8.56" rx="2.47" ry="2.47" />
        <ellipse fill="#c4c4c4" cx="10.85" cy="14.04" rx="3.19" ry="3.47" />
        <path
          fill="#fff"
          d="M10.85,11.07c1.48,0,2.69,1.33,2.69,2.97s-1.21,2.97-2.69,2.97-2.69-1.33-2.69-2.97,1.21-2.97,2.69-2.97h0ZM10.85,10.07c-2.04,0-3.69,1.78-3.69,3.97s1.65,3.97,3.69,3.97,3.69-1.78,3.69-3.97-1.65-3.97-3.69-3.97h0Z"
        />
        <ellipse fill="#575757" cx="10.85" cy="25.82" rx="3.69" ry="3.97" />
        <ellipse fill="#575757" cx="10.85" cy="37.6" rx="3.69" ry="3.97" />
        <ellipse fill="#575757" cx="10.85" cy="49.37" rx="3.69" ry="3.97" />
      </symbol>

      <symbol id="icon-redirects" viewBox="0 0 64 64">
        <rect fill="#666" opacity={0.5} x="7.25" y="7.1" width="50" height="50" rx="3.79" ry="3.79" />
        <path
          fill="#7c7c7c"
          d="M44.4,17.08c-.63-.63-1.65-.63-2.28,0s-.63,1.65,0,2.28l2.78,2.78H10.54c-1.33,0-2.42,1.08-2.42,2.42s1.08,2.42,2.42,2.42h34.07l-2.17,2.17c-.63.63-.63,1.65,0,2.28.31.31.73.47,1.14.47s.82-.16,1.14-.47l7-7-7.33-7.33Z"
        />
        <path
          fill="#ccc"
          stroke="#fff"
          strokeMiterlimit={10}
          d="M7.23,26.97h9.42l12.84,17.11h15.82l-2.41,2.41c-.63.63-.63,1.65,0,2.28.31.31.73.47,1.14.47s.82-.16,1.14-.47l7-7-7.33-7.33c-.63-.63-1.65-.63-2.28,0s-.63,1.65,0,2.28l2.53,2.53h-12.39l-12.84-17.11H7.23"
        />
      </symbol>

      <symbol id="icon-history" viewBox="0 0 64 64">
        <circle fill="#c4c4c4" cx="32" cy="33" r="26" />
        <circle fill="#fff" cx="32" cy="33" r="20.5" />
        <rect fill="#717171" x="30.5" y="16" width="3" height="19" rx="1.5" ry="1.5" />
        <rect fill="#717171" x="30.5" y="31.5" width="14" height="3" rx="1.5" ry="1.5" transform="translate(-11.6 32.9) rotate(-40)" />
        <path
          fill="#575757"
          d="M32,4.5c-2.3,0-4.55.24-6.72.7-.81.17-1.33.97-1.16,1.78s.97,1.33,1.78,1.16c1.96-.41,3.99-.63,6.09-.63,16.02,0,29,12.98,29,29s-12.98,29-29,29S3,49.02,3,33c0-8.61,3.75-16.34,9.71-21.66l-.32,3.63c-.07.82.54,1.55,1.36,1.62.05,0,.09,0,.14,0,.77,0,1.42-.59,1.48-1.36l.66-7.51c.07-.82-.54-1.55-1.36-1.62l-7.51-.66c-.82-.07-1.55.54-1.62,1.36-.07.82.54,1.55,1.36,1.62l3.94.34C4.68,15.24,0,23.62,0,33c0,17.67,14.33,32,32,32s32-14.33,32-32S49.67,4.5,32,4.5Z"
        />
      </symbol>

      <symbol id="icon-tab-page" viewBox="0 0 64 64">
        <path
          fill="#717171"
          d="M44.36,13.01c-.63-.78-1.52-1.28-2.52-1.39-.99-.11-1.98.17-2.76.8-.78.63-1.28,1.52-1.39,2.52s.17,1.98.8,2.76l11.12,13.91-11.12,13.91c-.63.78-.91,1.76-.8,2.76.11,1,.6,1.89,1.38,2.51.66.53,1.5.82,2.34.82,1.15,0,2.22-.51,2.93-1.41l14.88-18.6-14.88-18.6Z"
        />
        <path
          fill="#c4c4c4"
          d="M26.18,14.93c-.11-1-.6-1.89-1.38-2.51-.78-.63-1.77-.91-2.76-.8-1,.11-1.89.6-2.51,1.38L4.64,31.6l14.88,18.59c.71.9,1.78,1.41,2.93,1.41.85,0,1.68-.29,2.34-.82.78-.63,1.28-1.52,1.39-2.52.11-1-.17-1.98-.8-2.76l-11.13-13.91,11.12-13.91c.63-.78.91-1.76.8-2.76Z"
        />
      </symbol>

      <symbol id="icon-tab-sections" viewBox="0 0 64 64">
        <rect fill="#c4c4c4" x="6.86" y="7.89" width="49.42" height="9.34" rx="2.85" ry="2.85" />
        <rect fill="#717171" x="17.27" y="20.43" width="39.02" height="9.34" rx="3.28" ry="3.28" />
        <rect fill="#757575" x="6.86" y="32.98" width="49.42" height="9.34" rx="3.19" ry="3.19" />
        <rect fill="#757575" x="6.86" y="45.52" width="49.42" height="9.34" rx="3.19" ry="3.19" />
      </symbol>

      <symbol id="icon-tab-fields" viewBox="0 0 64 64">
        <rect fill="#c4c4c4" x="5.84" y="9.9" width="52.56" height="19.11" rx="3.44" ry="3.44" />
        <rect fill="#757575" x="11.79" y="12.7" width="2.53" height="13.31" rx="1.26" ry="1.26" />
        <rect fill="#757575" x="5.84" y="35.19" width="52.56" height="19.11" rx="3.44" ry="3.44" />
        <rect fill="#383838" x="11.79" y="38" width="2.53" height="13.31" rx="1.26" ry="1.26" />
      </symbol>

      <symbol id="icon-device-desktop" viewBox="0 0 64 64">
        <path
          fill="#c4c4c4"
          d="M51.57,39.84h-1.57v-17.97c0-2.47-2.02-4.49-4.49-4.49h-26.05c-2.47,0-4.49,2.02-4.49,4.49v17.97h-1.57c-1.8,0-3.37,1.57-3.37,3.37h44.92c0-1.8-1.57-3.37-3.37-3.37ZM18.33,21.87c0-.67.45-1.12,1.12-1.12h26.05c.67,0,1.12.45,1.12,1.12v17.07h-28.3v-17.07Z"
        />
      </symbol>

      <symbol id="icon-device-tablet" viewBox="0 0 64 64">
        <path
          fill="#c4c4c4"
          d="M43.17,13.59h-22.46c-2.47,0-4.49,2.02-4.49,4.49v26.95c0,2.47,2.02,4.49,4.49,4.49h22.46c2.47,0,4.49-2.02,4.49-4.49v-26.95c0-2.47-2.02-4.49-4.49-4.49ZM44.29,45.03c0,.67-.45,1.12-1.12,1.12h-22.46c-.67,0-1.12-.45-1.12-1.12v-26.95c0-.67.45-1.12,1.12-1.12h22.46c.67,0,1.12.45,1.12,1.12v26.95ZM27.44,43.91h8.98v-3.37h-8.98v3.37Z"
        />
      </symbol>

      <symbol id="icon-device-mobile" viewBox="0 0 64 64">
        <path
          fill="#c4c4c4"
          d="M38.67,13.41h-13.48c-2.47,0-4.49,2.02-4.49,4.49v26.95c0,2.47,2.02,4.49,4.49,4.49h13.48c2.47,0,4.49-2.02,4.49-4.49v-26.95c0-2.47-2.02-4.49-4.49-4.49ZM39.8,44.85c0,.67-.45,1.12-1.12,1.12h-13.48c-.67,0-1.12-.45-1.12-1.12v-26.95c0-.67.45-1.12,1.12-1.12h13.48c.67,0,1.12.45,1.12,1.12v26.95ZM29.69,43.73h4.49v-3.37h-4.49v3.37Z"
        />
      </symbol>
    </svg>
  );
}

function Icon({ id }: { id: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 64 64" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export function MenusIcon() {
  return <Icon id="icon-menus" />;
}

export function RedirectsIcon() {
  return <Icon id="icon-redirects" />;
}

export function HistoryIcon() {
  return <Icon id="icon-history" />;
}

export function TabPageIcon() {
  return <Icon id="icon-tab-page" />;
}

export function TabSectionsIcon() {
  return <Icon id="icon-tab-sections" />;
}

export function TabFieldsIcon() {
  return <Icon id="icon-tab-fields" />;
}

export function DeviceDesktopIcon() {
  return <Icon id="icon-device-desktop" />;
}

export function DeviceTabletIcon() {
  return <Icon id="icon-device-tablet" />;
}

export function DeviceMobileIcon() {
  return <Icon id="icon-device-mobile" />;
}
