import { useEffect, useRef, useState } from 'react';
import { useAddMenu } from './useAddMenu.ts';
import { BulletListIcon, LinkIcon, NumberedListIcon } from './richtext-toolbar-icons.tsx';
import { normalizeLegacyTags, sanitizeRichText } from './sanitize-richtext.ts';

export interface RichTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  labelledBy: string;
}

// contentEditable is deliberately uncontrolled, not a React-managed
// value - a controlled contentEditable would reset the cursor to the
// start on every keystroke (React has no reliable way to restore
// cursor position inside arbitrary rich HTML on rerender the way it
// can with a plain <input>'s selectionStart/End). The effect below
// only writes innerHTML when the incoming value prop diverges from the
// live DOM (switching selected instance elsewhere in the editor) -
// never on the rerender caused by this field's own last edit, because
// applyChange always finishes with editorRef.current.innerHTML already
// equal to the sanitized value it just called onChange with, so the
// prop that comes back down next render matches what's already there.
export function RichTextField({ value, onChange, labelledBy }: RichTextFieldProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const { open: linkOpen, setOpen: setLinkOpen, ref: linkMenuRef, toggle: toggleLink } = useAddMenu();

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

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

  return (
    <div className="richtext-field">
      <div className="richtext-toolbar" role="group" aria-label="Formatting">
        <button type="button" onMouseDown={preserveSelection} onClick={() => runCommand('formatBlock', '<p>')}>
          ¶
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => runCommand('formatBlock', '<h1>')}>
          H1
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => runCommand('formatBlock', '<h2>')}>
          H2
        </button>
        <button type="button" onMouseDown={preserveSelection} onClick={() => runCommand('formatBlock', '<h3>')}>
          H3
        </button>
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
      </div>
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
    </div>
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
