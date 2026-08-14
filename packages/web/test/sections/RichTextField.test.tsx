import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RichTextField } from '../../src/sections/RichTextField.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderField(value: string, onChange = vi.fn()) {
  render(
    <div>
      <span id="body-label">Body</span>
      <RichTextField value={value} onChange={onChange} labelledBy="body-label" />
    </div>,
  );
  return { onChange, editor: screen.getByLabelText('Body') };
}

describe('RichTextField', () => {
  it('renders the initial value into the contentEditable region', () => {
    const { editor } = renderField('<p>Hello</p>');
    expect(editor.innerHTML).toBe('<p>Hello</p>');
  });

  it('typing (simulated by an input event) calls onChange with the sanitized HTML', () => {
    const { editor, onChange } = renderField('<p>Hello</p>');

    editor.innerHTML = '<p>Hello there</p>';
    fireEvent.input(editor);

    expect(onChange).toHaveBeenCalledWith('<p>Hello there</p>');
  });

  // The most important test in this file: proves DOMPurify actually
  // ran on every change, not just on the toolbar's own known-safe
  // actions - a user can paste or otherwise inject arbitrary markup
  // into a contentEditable region, and this HTML is eventually
  // rendered raw on a real site.
  it('strips disallowed tags/attributes before ever calling onChange', () => {
    const { editor, onChange } = renderField('<p>Hello</p>');

    editor.innerHTML = '<div onclick="alert(1)"><script>evil()</script>text</div><p style="color:red">safe</p>';
    fireEvent.input(editor);

    const [sanitized] = onChange.mock.calls.at(-1) as [string];
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('<div');
    expect(sanitized).not.toContain('style=');
    expect(sanitized).toContain('safe');
  });

  it('keeps a javascript: href out of a link', () => {
    const { editor, onChange } = renderField('');

    editor.innerHTML = '<p><a href="javascript:alert(1)">click</a></p>';
    fireEvent.input(editor);

    const [sanitized] = onChange.mock.calls.at(-1) as [string];
    expect(sanitized).not.toContain('javascript:');
  });

  it('the value-prop-sync effect updates the DOM when value diverges (switching selected instance)', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <div>
        <span id="body-label">Body</span>
        <RichTextField value="<p>First</p>" onChange={onChange} labelledBy="body-label" />
      </div>,
    );

    rerender(
      <div>
        <span id="body-label">Body</span>
        <RichTextField value="<p>Second</p>" onChange={onChange} labelledBy="body-label" />
      </div>,
    );

    expect(screen.getByLabelText('Body').innerHTML).toBe('<p>Second</p>');
  });

  describe('toolbar buttons', () => {
    it('Bold calls execCommand("bold")', () => {
      const execSpy = vi.spyOn(document, 'execCommand');
      renderField('<p>x</p>');

      fireEvent.click(screen.getByRole('button', { name: 'Bold' }));

      expect(execSpy).toHaveBeenCalledWith('bold', false, undefined);
    });

    it('Italic calls execCommand("italic")', () => {
      const execSpy = vi.spyOn(document, 'execCommand');
      renderField('<p>x</p>');

      fireEvent.click(screen.getByRole('button', { name: 'Italic' }));

      expect(execSpy).toHaveBeenCalledWith('italic', false, undefined);
    });

    it('H1/H2/H3/Paragraph call execCommand("formatBlock", ...)', () => {
      const execSpy = vi.spyOn(document, 'execCommand');
      renderField('<p>x</p>');

      fireEvent.click(screen.getByRole('button', { name: 'H1' }));
      fireEvent.click(screen.getByRole('button', { name: 'H2' }));
      fireEvent.click(screen.getByRole('button', { name: 'H3' }));
      fireEvent.click(screen.getByRole('button', { name: '¶' }));

      expect(execSpy).toHaveBeenCalledWith('formatBlock', false, '<h1>');
      expect(execSpy).toHaveBeenCalledWith('formatBlock', false, '<h2>');
      expect(execSpy).toHaveBeenCalledWith('formatBlock', false, '<h3>');
      expect(execSpy).toHaveBeenCalledWith('formatBlock', false, '<p>');
    });

    it('Bullet list / Numbered list call the matching execCommand', () => {
      const execSpy = vi.spyOn(document, 'execCommand');
      renderField('<p>x</p>');

      fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }));
      fireEvent.click(screen.getByRole('button', { name: 'Numbered list' }));

      expect(execSpy).toHaveBeenCalledWith('insertUnorderedList', false, undefined);
      expect(execSpy).toHaveBeenCalledWith('insertOrderedList', false, undefined);
    });

    it('mousedown on a toolbar button is prevented, so it never steals focus/selection from the editor', () => {
      renderField('<p>x</p>');

      const event = fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' }));

      // fireEvent returns false when the event's default was prevented.
      expect(event).toBe(false);
    });

    it('the Link popover opens on click and calls execCommand("createLink", ...) on confirm', () => {
      const execSpy = vi.spyOn(document, 'execCommand');
      renderField('<p>x</p>');

      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
      fireEvent.change(screen.getByPlaceholderText('https://'), { target: { value: 'https://example.com' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

      expect(execSpy).toHaveBeenCalledWith('createLink', false, 'https://example.com');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('cancelling the Link popover closes it without calling createLink', () => {
      const execSpy = vi.spyOn(document, 'execCommand');
      renderField('<p>x</p>');

      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(execSpy).not.toHaveBeenCalledWith('createLink', false, expect.anything());
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('paste is sanitized before insertion, not inserted raw then cleaned up after', () => {
    const execSpy = vi.spyOn(document, 'execCommand');
    const { editor } = renderField('<p>x</p>');

    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => (type === 'text/html' ? '<p onclick="x()">pasted</p>' : 'pasted'),
      },
    });

    const insertHtmlCall = execSpy.mock.calls.find((call) => call[0] === 'insertHTML');
    expect(insertHtmlCall?.[2]).not.toContain('onclick');
    expect(insertHtmlCall?.[2]).toContain('pasted');
  });
});
