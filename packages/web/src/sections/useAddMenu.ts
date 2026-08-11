import { useEffect, useRef, useState } from 'react';

// Shared by SectionList's "Add Section" and BlockList's "Add Block"
// popovers (and mirrors AppShell's own account popover, which keeps
// its own copy since it never needs the upward/downward flip below).
// Outside-click and window-blur both dismiss - blur matters because
// this sits in the editor sidebar right next to the live preview
// iframe, and a click landing inside it is a separate document that
// never bubbles a mousedown up here.
export function useAddMenu() {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleWindowBlur(): void {
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [open]);

  // The menu prefers opening upward (it usually sits after the list it
  // adds to), but a section/block near the top of the editor's own
  // scrollable panel has no room above - opening upward there gets the
  // top of the menu clipped by that panel's own overflow-y: auto,
  // hiding and disabling whichever items land above its edge (found
  // live: they render behind the Page/Sections tab bar and silently
  // eat the click). Flip downward instead whenever the nearest
  // scrolling ancestor doesn't have enough headroom above the trigger.
  function toggle(): void {
    if (!open && ref.current) {
      const triggerTop = ref.current.getBoundingClientRect().top;
      const clipTop = nearestScrollClipTop(ref.current);
      const estimatedMenuHeight = 268;
      setOpenUpward(triggerTop - estimatedMenuHeight >= clipTop);
    }
    setOpen((current) => !current);
  }

  return { open, setOpen, openUpward, ref, toggle };
}

function nearestScrollClipTop(el: HTMLElement): number {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') {
      return node.getBoundingClientRect().top;
    }
    node = node.parentElement;
  }
  return 0;
}
