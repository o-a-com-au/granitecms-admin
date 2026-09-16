import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useAddMenu } from '../sections/useAddMenu.ts';

export interface ComboboxProps {
  value: string;
  // Suggestions only - this control never restricts what can be typed.
  options: string[];
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
}

// A text input with a dropdown of existing values beside it: type
// anything, or pick one that is already in use. Built rather than
// using a native <input list>/<datalist> (requested directly, after
// weighing both): a datalist's own dropdown affordance is drawn by the
// browser and cannot be styled, and every native <select> in this app
// is restyled with its own chevron - a datalist would have read as a
// plain text input sitting among styled selects, and on some browsers
// its affordance is close to invisible.
//
// Deliberately NOT SelectField (sections/SelectField.tsx): that one
// renders a schema enum as tabs or a <select> and cannot accept a
// value outside its own option list, which is the whole point here.
//
// Dismissal reuses useAddMenu, the same hook the row action menus and
// Add Section/Block popovers use, so outside-click and window-blur
// behave identically to every other popover in this app - including
// the blur case, which matters beside a live preview iframe whose
// clicks never bubble a mousedown into this document.
export function Combobox({ value, options, onChange, id, placeholder, disabled }: ComboboxProps) {
  const { open, setOpen, ref, toggle } = useAddMenu();
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  // Which option the keyboard is on, as an index into visibleOptions.
  // -1 means "none", so Enter commits whatever was typed rather than
  // silently substituting the first suggestion.
  const [activeIndex, setActiveIndex] = useState(-1);
  // What has been typed since the list opened, or null when it was
  // opened without typing. Deliberately separate from `value`: filtering
  // on the committed value meant that once a value was chosen, reopening
  // the list showed only that one entry, so the dropdown could never be
  // used to change an existing choice - the exact thing it is for.
  const [query, setQuery] = useState<string | null>(null);

  // Typing narrows; opening does not. Either way suggestions never
  // block: a value matching nothing is still perfectly valid, it simply
  // has nothing to offer.
  const normalisedQuery = query === null ? '' : query.trim().toLowerCase();
  const visibleOptions =
    normalisedQuery === '' ? options : options.filter((option) => option.toLowerCase().includes(normalisedQuery));

  function commit(next: string): void {
    onChange(next);
    setOpen(false);
    setActiveIndex(-1);
    setQuery(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        // Opened by keyboard rather than typed into, so show everything.
        setQuery(null);
        setOpen(true);
        return;
      }
      if (visibleOptions.length === 0) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + step;
        if (next < 0) {
          return visibleOptions.length - 1;
        }
        return next >= visibleOptions.length ? 0 : next;
      });
      return;
    }
    if (event.key === 'Enter' && open && activeIndex >= 0) {
      // Only swallow Enter when it is genuinely choosing a suggestion -
      // otherwise it belongs to whatever form this sits in.
      event.preventDefault();
      commit(visibleOptions[activeIndex] as string);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="combobox" ref={ref}>
      <input
        ref={inputRef}
        id={id}
        className="combobox-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(event.target.value);
          setActiveIndex(-1);
          if (!open) {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className="combobox-toggle"
        // Not a separate tab stop: the input owns the keyboard
        // interaction (ArrowDown opens), and a second stop on every one
        // of these would double the tab length of a form full of them.
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onClick={() => {
          setQuery(null);
          toggle();
          setActiveIndex(-1);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7 15 5 5 5-5" />
          <path d="m7 9 5-5 5 5" />
        </svg>
      </button>
      {open && visibleOptions.length > 0 && (
        <ul className="combobox-list" id={listId} role="listbox">
          {visibleOptions.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option === value}
                className={`combobox-option${index === activeIndex ? ' is-active' : ''}`}
                // mousedown, not click: the input's own blur would
                // otherwise close this list before a click ever lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option);
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
