import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ColorPickerPopover } from '../../src/sections/ColorPickerPopover.tsx';

afterEach(() => {
  cleanup();
});

function renderPopover(onChange = vi.fn(), onClose = vi.fn()) {
  const anchorRef = createRef<HTMLButtonElement>();
  render(
    <>
      <button ref={anchorRef} type="button">
        Anchor
      </button>
      <ColorPickerPopover anchorRef={anchorRef} value="#c2410c" onChange={onChange} onClose={onClose} />
    </>,
  );
  return { onChange, onClose };
}

function popoverHex(): HTMLInputElement {
  return document.querySelector('.colour-picker-popover-hex-input') as HTMLInputElement;
}

describe('ColorPickerPopover', () => {
  it('renders into document.body via a portal, with the gradient picker and a hex input', () => {
    renderPopover();

    const dialog = screen.getByRole('dialog', { name: 'Choose a colour' });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.querySelector('.react-colorful__saturation')).not.toBeNull();
    expect(popoverHex().value).toBe('#c2410c');
  });

  it('typing in the hex input does not commit until blur', () => {
    const { onChange } = renderPopover();

    fireEvent.change(popoverHex(), { target: { value: '#1d4ed8' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('blurring a valid hex commits it, normalised to lowercase', () => {
    const { onChange } = renderPopover();

    fireEvent.change(popoverHex(), { target: { value: '#1D4ED8' } });
    fireEvent.blur(popoverHex());

    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
  });

  it('pressing Enter commits and closes the popover, same as the tick button', () => {
    const { onChange, onClose } = renderPopover();

    fireEvent.change(popoverHex(), { target: { value: '#1d4ed8' } });
    fireEvent.keyDown(popoverHex(), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
    expect(onClose).toHaveBeenCalled();
  });

  it('pressing Enter on an invalid hex reverts the text and does not close', () => {
    const { onChange, onClose } = renderPopover();

    fireEvent.change(popoverHex(), { target: { value: 'nope' } });
    fireEvent.keyDown(popoverHex(), { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(popoverHex().value).toBe('#c2410c');
  });

  it('blurring an invalid hex reverts the text without calling onChange', () => {
    const { onChange } = renderPopover();

    fireEvent.change(popoverHex(), { target: { value: 'nope' } });
    fireEvent.blur(popoverHex());

    expect(onChange).not.toHaveBeenCalled();
    expect(popoverHex().value).toBe('#c2410c');
  });

  it('clicking the tick button approves the typed hex and closes the popover', () => {
    const { onChange, onClose } = renderPopover();

    fireEvent.change(popoverHex(), { target: { value: '#1d4ed8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve colour' }));

    expect(onChange).toHaveBeenCalledWith('#1d4ed8');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the tick button with an invalid hex reverts the text and does not close', () => {
    const { onChange, onClose } = renderPopover();

    fireEvent.change(popoverHex(), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve colour' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(popoverHex().value).toBe('#c2410c');
  });

  it('a click outside both the popover and its anchor closes it', () => {
    const { onClose } = renderPopover();

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalled();
  });

  it('a click on the anchor itself does not close it', () => {
    const { onClose } = renderPopover();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Anchor' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('a click inside the popover itself does not close it', () => {
    const { onClose } = renderPopover();

    fireEvent.mouseDown(popoverHex());

    expect(onClose).not.toHaveBeenCalled();
  });

  it('pressing Escape closes it', () => {
    const { onClose } = renderPopover();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('a window blur closes it', () => {
    const { onClose } = renderPopover();

    fireEvent.blur(window);

    expect(onClose).toHaveBeenCalled();
  });

  it('a scroll anywhere closes it', () => {
    const { onClose } = renderPopover();

    document.body.dispatchEvent(new Event('scroll', { bubbles: false }));

    expect(onClose).toHaveBeenCalled();
  });
});
