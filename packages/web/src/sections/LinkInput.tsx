import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useAddMenu } from './useAddMenu.ts';
import { useSitePages, type SitePage } from './useSitePages.ts';

export interface LinkInputProps {
  siteId: string;
  value: string;
  onChange: (value: string) => void;
  // The id of the element naming this field. A link field is labelled by
  // reference, never by a wrapping <label>: a <label> folds all the text
  // inside it (the suggestions, the "Links to" line) into the field's
  // accessible name.
  labelledBy?: string;
  ariaLabel?: string;
  placeholder?: string;
  // Enter with no suggestion chosen, for a caller with no <form> to
  // submit (the rich-text link popover).
  onEnter?: () => void;
  autoFocus?: boolean;
}

// Where a site-relative link points, without its ?query or #fragment, and
// with no trailing slash (except the home page's own "/"). null for
// anything that isn't a link to one of this site's pages: an external
// address, mailto:/tel:, a bare #anchor, or a media or asset file.
export function internalPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }
  const path = trimmed.replace(/[?#].*$/, '');
  if (path.startsWith('/media/') || path.startsWith('/assets/')) {
    return null;
  }
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function fragmentOf(value: string): string {
  const index = value.indexOf('#');
  return index > 0 ? value.slice(index) : '';
}

function matches(page: SitePage, query: string): boolean {
  return page.title.toLowerCase().includes(query) || page.url.toLowerCase().includes(query);
}

// The URL field (format: "url", and "uri" before it), the menu item
// editor's URL and the rich-text link dialog: type a page's title or path
// to pick one of the site's pages, or type any address at all (external,
// mailto:, tel:, #anchor). Below it, a site path says which page it
// reaches, or that no page is there. Same look and keyboard behaviour as
// Combobox.tsx, which takes plain strings only; these suggestions carry a
// title, a path and a draft tag.
export function LinkInput({ siteId, value, onChange, labelledBy, ariaLabel, placeholder, onEnter, autoFocus }: LinkInputProps) {
  const pages = useSitePages(siteId);
  const { open, setOpen, ref, toggle } = useAddMenu();
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const statusId = `${baseId}-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // What has been typed since the list opened (null when opened without
  // typing, which shows every page) - see Combobox.tsx for why this is
  // kept apart from the value itself.
  const [query, setQuery] = useState<string | null>(null);

  const normalisedQuery = query === null ? '' : query.trim().toLowerCase();
  // Typing a full address, mailto:, tel: or #anchor isn't a page search.
  const searching = !/^([a-z][a-z0-9+.-]*:|#)/i.test(normalisedQuery);
  const suggestions = pages === null || !searching ? [] : normalisedQuery === '' ? pages : pages.filter((page) => matches(page, normalisedQuery));

  const path = internalPath(value);
  const target = path === null || pages === null ? undefined : pages.find((page) => page.url === path);

  function choose(page: SitePage): void {
    // A #fragment already there (a section of the page) is kept.
    onChange(page.url + fragmentOf(value));
    setOpen(false);
    setActiveIndex(-1);
    setQuery(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setQuery(null);
        setOpen(true);
        return;
      }
      if (suggestions.length === 0) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        const next = current + step;
        return next < 0 ? suggestions.length - 1 : next >= suggestions.length ? 0 : next;
      });
      return;
    }
    if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        choose(suggestions[activeIndex]);
        return;
      }
      if (onEnter) {
        event.preventDefault();
        setOpen(false);
        onEnter();
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  let status = null;
  if (path !== null && pages !== null) {
    status = target ? (
      <p className="link-input-status" id={statusId}>
        Links to {target.title}
        {!target.published && <span className="page-tree-draft-badge link-input-draft">Draft</span>}
      </p>
    ) : (
      <p className="link-input-status is-missing" id={statusId}>
        No page at {path}
      </p>
    );
  }

  return (
    <div className="link-input">
      <div className="combobox" ref={ref}>
        <input
          ref={inputRef}
          className="combobox-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : ariaLabel}
          aria-describedby={status ? statusId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder ?? 'Search pages or paste a URL'}
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
          tabIndex={-1}
          aria-hidden="true"
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
        {open && suggestions.length > 0 && (
          <ul className="combobox-list" id={listId} role="listbox">
            {suggestions.map((page, index) => (
              <li key={page.url}>
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={page.url === path}
                  className={`combobox-option link-input-option${index === activeIndex ? ' is-active' : ''}`}
                  // mousedown, not click: the input's blur would close
                  // the list before a click landed (as in Combobox.tsx).
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(page);
                  }}
                >
                  <span className="link-input-option-title">
                    {page.title}
                    {!page.published && <span className="page-tree-draft-badge link-input-draft">Draft</span>}
                  </span>
                  <span className="link-input-option-path">{page.url}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {status}
    </div>
  );
}
