import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAddMenu } from './useAddMenu.ts';
import {
  BulletListIcon,
  ChevronDownIcon,
  CollapseIcon,
  EnlargeIcon,
  LinkIcon,
  NumberedListIcon,
} from './richtext-toolbar-icons.tsx';
import { normalizeLegacyTags, sanitizeRichText } from './sanitize-richtext.ts';

export interface RichTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  labelledBy: string;
}

interface FormatOption {
  label: string;
  // The trigger's own compact display text (docs/designs/richtext-field.png
  // shows "H1", not "Heading 1") - the menu list and the trigger's
  // aria-label still use the full `label` below, where space isn't
  // tight and "Paragraph" reads far clearer than a bare "P".
  shortLabel: string;
  formatBlockValue: string;
}

// docs/designs/richtext-field.png's own top-left dropdown, replacing
// the four separate Paragraph/H1/H2/H3 buttons this field used to
// render individually. H4/H5 added on top of the design reference -
// keep sanitize-richtext.ts's own ALLOWED_TAGS in sync with whatever
// tags are listed here, or a selected heading level would be stripped
// straight back out on the very next sanitize pass.
const FORMAT_OPTIONS: FormatOption[] = [
  { label: 'Paragraph', shortLabel: 'P', formatBlockValue: '<p>' },
  { label: 'H1', shortLabel: 'H1', formatBlockValue: '<h1>' },
  { label: 'H2', shortLabel: 'H2', formatBlockValue: '<h2>' },
  { label: 'H3', shortLabel: 'H3', formatBlockValue: '<h3>' },
  { label: 'H4', shortLabel: 'H4', formatBlockValue: '<h4>' },
  { label: 'H5', shortLabel: 'H5', formatBlockValue: '<h5>' },
];

// contentEditable is deliberately uncontrolled, not a React-managed
// value - a controlled contentEditable would reset the cursor to the
// start on every keystroke (React has no reliable way to restore
// cursor position inside arbitrary rich HTML on rerender the way it
// can with a plain <input>'s selectionStart/End). The effect below
// only writes innerHTML when the incoming value prop diverges from the
// live DOM (switching selected instance elsewhere in the editor, or
// the inline/popup editor swapping which DOM node is mounted) - never
// on the rerender caused by this field's own last edit, because
// applyChange always finishes with editorRef.current.innerHTML already
// equal to the sanitized value it just called onChange with, so the
// prop that comes back down next render matches what's already there.
export function RichTextField({ value, onChange, labelledBy }: RichTextFieldProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [format, setFormat] = useState(FORMAT_OPTIONS[0]!.label);
  const { open: linkOpen, setOpen: setLinkOpen, ref: linkMenuRef, toggle: toggleLink } = useAddMenu();
  const { open: formatOpen, setOpen: setFormatOpen, ref: formatMenuRef, toggle: toggleFormat } = useAddMenu();
  const currentFormatOption = FORMAT_OPTIONS.find((option) => option.label === format) ?? FORMAT_OPTIONS[0]!;

  // Also re-runs when `expanded` flips: the inline editor and the
  // popup editor are two different DOM nodes in the tree (only one is
  // ever mounted at a time), so swapping between them mounts a fresh,
  // empty contentEditable div that needs the same value written into
  // it a plain `value` divergence check wouldn't otherwise catch.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value, expanded]);

  // The one path every DOM mutation ends up going through, however it
  // happened (typing, a toolbar execCommand, paste) - nothing reaches
  // onChange without normalizeLegacyTags + sanitizeRichText running on
  // it first, since this HTML is eventually rendered raw on a real
  // site.
  function applyChange(): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    normalizeLegacyTags(editor);
    const sanitized = sanitizeRichText(editor.innerHTML);
    if (editor.innerHTML !== sanitized) {
      editor.innerHTML = sanitized;
    }
    onChange(sanitized);
  }

  // Toolbar buttons never take focus themselves - mousedown fires
  // before the click's own selection change, so without this the
  // browser blurs the contentEditable and collapses its selection
  // before execCommand ever runs, silently turning every action into a
  // no-op.
  function preserveSelection(event: React.MouseEvent): void {
    event.preventDefault();
  }

  function runCommand(command: string, commandValue?: string): void {
    document.execCommand(command, false, commandValue);
    applyChange();
  }

  function selectFormat(option: FormatOption): void {
    setFormat(option.label);
    setFormatOpen(false);
    runCommand('formatBlock', option.formatBlockValue);
  }

  // Interacting with the popover's own input inevitably steals focus
  // (and with it, contentEditable's selection) away from the editor,
  // so the selection existing at the moment the Link button was
  // clicked has to be captured now and restored just before
  // createLink runs on confirm - otherwise the link would apply to
  // wherever focus happens to land instead of the text the user
  // actually selected.
  function openLinkPopover(): void {
    const selection = window.getSelection();
    savedRangeRef.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    setLinkUrl('');
    toggleLink();
  }

  function confirmLink(): void {
    const range = savedRangeRef.current;
    if (range) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    if (linkUrl.trim() !== '') {
      document.execCommand('createLink', false, linkUrl.trim());
    }
    setLinkOpen(false);
    applyChange();
  }

  // preventDefault + a manual sanitize-then-insert, rather than
  // letting the browser's own paste land first and cleaning up
  // afterwards in onInput - html a browser inserts unsanitized (even
  // briefly) can carry live event-handler attributes, so sanitizing
  // before it ever touches the DOM is the safer order. text/plain is
  // escaped rather than inserted raw, so a literal "<script>" typed or
  // pasted as plain text can't be reinterpreted as markup once
  // execCommand('insertHTML', ...) puts it in the DOM.
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>): void {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    const sanitized = html ? sanitizeRichText(html) : escapeHtml(text);
    document.execCommand('insertHTML', false, sanitized);
    applyChange();
  }

  const toolbar = (
    <div className="richtext-toolbar" role="group" aria-label="Formatting">
      <div className="richtext-format-wrap" ref={formatMenuRef}>
        <button
          type="button"
          className="richtext-format-trigger"
          aria-haspopup="listbox"
          aria-expanded={formatOpen}
          // An explicit aria-label, not just the visible {format} text -
          // this button sits inside SchemaField's own outer <label>
          // (wrapping the whole field, "Body" etc), and a button with no
          // aria-label of its own picks up that ancestor label's text
          // too in a real browser's accessible-name computation (not
          // reproduced by jsdom, so this only surfaced live testing
          // against a real one - every other toolbar button already had
          // its own aria-label for the same reason).
          aria-label={`Paragraph style: ${format}`}
          onMouseDown={preserveSelection}
          onClick={toggleFormat}
        >
          <span className="richtext-toolbar-icon richtext-format-chevron">
            <ChevronDownIcon />
          </span>
          {currentFormatOption.shortLabel}
        </button>
        {formatOpen && (
          <div className="richtext-format-menu" role="listbox" aria-label="Paragraph style">
            {FORMAT_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                role="option"
                aria-selected={option.label === format}
                aria-label={option.label}
                className="richtext-format-menu-item"
                onMouseDown={preserveSelection}
                onClick={() => selectFormat(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="richtext-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        className="richtext-toolbar-bold"
        aria-label="Bold"
        onMouseDown={preserveSelection}
        onClick={() => runCommand('bold')}
      >
        B
      </button>
      <button
        type="button"
        className="richtext-toolbar-italic"
        aria-label="Italic"
        onMouseDown={preserveSelection}
        onClick={() => runCommand('italic')}
      >
        I
      </button>
      <div className="richtext-link-wrap" ref={linkMenuRef}>
        <button
          type="button"
          aria-label="Link"
          aria-haspopup="dialog"
          aria-expanded={linkOpen}
          onMouseDown={preserveSelection}
          onClick={openLinkPopover}
        >
          <span className="richtext-toolbar-icon">
            <LinkIcon />
          </span>
        </button>
        {linkOpen && (
          <div className="richtext-link-popover" role="dialog" aria-label="Link URL">
            <input
              type="text"
              placeholder="https://"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirmLink();
                }
              }}
            />
            <div className="richtext-link-popover-actions">
              <button type="button" onClick={() => setLinkOpen(false)}>
                Cancel
              </button>
              <button type="button" className="button-primary" onClick={confirmLink}>
                Add link
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Bullet list"
        onMouseDown={preserveSelection}
        onClick={() => runCommand('insertUnorderedList')}
      >
        <span className="richtext-toolbar-icon">
          <BulletListIcon />
        </span>
      </button>
      <button
        type="button"
        aria-label="Numbered list"
        onMouseDown={preserveSelection}
        onClick={() => runCommand('insertOrderedList')}
      >
        <span className="richtext-toolbar-icon">
          <NumberedListIcon />
        </span>
      </button>
      <div className="richtext-toolbar-spacer" />
      <div className="richtext-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        // "editor" suffix, not just "Enlarge"/"Collapse" - the sidebar's
        // own section-row chevron (instance-rows.css) already uses the
        // bare label "Collapse" when expanded, and two same-named
        // controls on one page is exactly the kind of ambiguity real
        // screen-reader testing (not jsdom) surfaces.
        aria-label={expanded ? 'Collapse editor' : 'Enlarge editor'}
        onMouseDown={preserveSelection}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="richtext-toolbar-icon">{expanded ? <CollapseIcon /> : <EnlargeIcon />}</span>
      </button>
    </div>
  );

  const editor = (
    <div
      ref={editorRef}
      className="richtext-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-labelledby={labelledBy}
      onInput={applyChange}
      onPaste={handlePaste}
    />
  );

  const fieldBox = (
    <div className="richtext-field-box">
      {toolbar}
      {editor}
    </div>
  );

  // The enlarge button swaps which DOM node is mounted (inline vs.
  // inside a large popup) rather than showing both at once - the
  // useEffect above handles keeping whichever one is currently mounted
  // in sync with `value`. No Escape/backdrop-click dismissal, matching
  // every other modal already in this app (ConfirmDialog,
  // MediaPickerModal) - the toolbar's own toggle button is the one way
  // in and out.
  // Portal to document.body for the same reason MediaPickerModal does:
  // this field only ever renders inside .editor-fields-panel, whose
  // permanent transform (translateX(0) even while open, never `none`)
  // makes it the containing block for a position: fixed descendant -
  // without the portal this modal opens inside the edit pane instead
  // of over the whole page, same bug, same fix.
  if (expanded) {
    return createPortal(
      <div className="modal-overlay">
        <div className="richtext-field-modal" role="dialog" aria-modal="true" aria-label="Edit rich text">
          {fieldBox}
        </div>
      </div>,
      document.body,
    );
  }
  return fieldBox;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
