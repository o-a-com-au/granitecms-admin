import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';
import { normalizeHex } from './colour-utils.ts';

export interface ColorPickerPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const GAP = 8;
const MARGIN = 8;

// Portalled to document.body for the same reason MediaPickerModal and
// RichTextField's enlarge modal already are: this is only ever opened
// from inside .editor-fields-panel, whose permanent transform makes it
// the containing block for a position: fixed descendant, and whose
// own overflow: auto would clip an absolutely-positioned one anyway.
// Position is measured in two passes rather than guessed up front -
// render once (invisible, at 0,0) purely to learn the popover's own
// real size from its own ref, then place it against the anchor's
// actual bounding rect, clamped to the viewport. Guessing
// react-colorful's rendered dimensions ahead of time would silently
// break the moment its own internal layout changes.
export function ColorPickerPopover({ anchorRef, value, onChange, onClose }: ColorPickerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [hexText, setHexText] = useState(value);

  useEffect(() => {
    setHexText(value);
  }, [value]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) {
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    let top = anchorRect.bottom + GAP;
    if (top + popoverRect.height > window.innerHeight - MARGIN) {
      top = anchorRect.top - popoverRect.height - GAP;
    }
    top = Math.max(MARGIN, top);

    let left = anchorRect.left;
    if (left + popoverRect.width > window.innerWidth - MARGIN) {
      left = window.innerWidth - popoverRect.width - MARGIN;
    }
    left = Math.max(MARGIN, left);

    setPosition({ top, left });
    // Deliberately a mount-only measurement (empty deps), not re-run
    // on every render - the popover's own size and the anchor's
    // position don't change while it's open.
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (popover?.contains(target)) {
        return;
      }
      if (anchor?.contains(target)) {
        return;
      }
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    function handleDismiss(): void {
      onClose();
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleDismiss);
    // capture: true - a scroll inside .editor-fields-panel (or any
    // other scrollable ancestor) doesn't bubble, but does fire in the
    // capture phase up to window. Without this, scrolling the panel
    // would leave the popover visually detached from its anchor.
    window.addEventListener('scroll', handleDismiss, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
    };
  }, [anchorRef, onClose]);

  function commitHexText(raw: string): void {
    const normalized = normalizeHex(raw);
    if (normalized === null) {
      setHexText(value);
      return;
    }
    onChange(normalized);
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="colour-picker-popover"
      role="dialog"
      aria-label="Choose a colour"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <HexColorPicker color={value} onChange={onChange} />
      <input
        type="text"
        className="colour-picker-popover-hex-input"
        value={hexText}
        placeholder="#000000"
        spellCheck={false}
        onChange={(event) => setHexText(event.target.value)}
        onBlur={(event) => commitHexText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitHexText(event.currentTarget.value);
          }
        }}
      />
    </div>,
    document.body,
  );
}
