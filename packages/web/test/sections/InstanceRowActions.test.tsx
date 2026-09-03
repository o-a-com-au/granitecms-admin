import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InstanceRowActions } from '../../src/sections/InstanceRowActions.tsx';

function icon(label: string) {
  return <span aria-hidden="true">{label}</span>;
}

describe('InstanceRowActions', () => {
  it('renders up to two actions as direct icon buttons, not a more-actions trigger', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <InstanceRowActions
        actions={[
          { key: 'edit', label: 'Edit thing', icon: icon('e'), onClick: onEdit },
          { key: 'delete', label: 'Delete thing', icon: icon('d'), variant: 'destructive', onClick: onDelete },
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit thing' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete thing' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('gives the edit action button.instance-row-edit, not the chevron\'s own class', () => {
    render(<InstanceRowActions actions={[{ key: 'edit', label: 'Edit thing', icon: icon('e'), onClick: vi.fn() }]} />);

    const button = screen.getByRole('button', { name: 'Edit thing' });
    expect(button.className).toBe('instance-row-edit');
  });

  it('collapses three or more actions into a single "More actions" trigger with a menu', () => {
    const onEdit = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(
      <InstanceRowActions
        actions={[
          { key: 'edit', label: 'Edit thing', icon: icon('e'), onClick: onEdit },
          { key: 'duplicate', label: 'Duplicate thing', icon: icon('u'), onClick: onDuplicate },
          { key: 'delete', label: 'Delete thing', icon: icon('d'), variant: 'destructive', onClick: onDelete },
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit thing' })).toBeNull();
    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Edit thing' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Duplicate thing' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Delete thing' })).toBeDefined();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate thing' }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    // Selecting an item closes the menu.
    expect(screen.queryByRole('menuitem', { name: 'Edit thing' })).toBeNull();
  });

  it('the more-actions menu closes on an outside click', () => {
    render(
      <div>
        <InstanceRowActions
          actions={[
            { key: 'a', label: 'A', icon: icon('a'), onClick: vi.fn() },
            { key: 'b', label: 'B', icon: icon('b'), onClick: vi.fn() },
            { key: 'c', label: 'C', icon: icon('c'), onClick: vi.fn() },
          ]}
        />
        <button type="button">outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it("an action button's click never bubbles to an ancestor row's own onClick", () => {
    const rowClick = vi.fn();
    const actionClick = vi.fn();
    render(
      <div onClick={rowClick}>
        <InstanceRowActions actions={[{ key: 'edit', label: 'Edit thing', icon: icon('e'), onClick: actionClick }]} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit thing' }));
    expect(actionClick).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });
});
