import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { listSiteContent, type ContentListEntry } from '../api/site-content.ts';
import { CloseIcon } from '../sections/CloseIcon.tsx';

export interface AddressBarSearchModalProps {
  siteId: string;
  domainLabel: string;
  // The real .app-topbar-address-bar's own measured position/size at
  // the moment it was clicked (AppShell.tsx) - the search box is
  // pinned to this exact spot rather than centred in the viewport, so
  // it reads as that same element turning white and growing, not a
  // separate dialog appearing elsewhere (corrected per feedback, with
  // a mockup - a first pass centred it instead, which drifts from the
  // real bar's own position on any viewport where .app-topbar-start/
  // .app-topbar-end aren't equal widths).
  anchorRect: { top: number; left: number; width: number };
  onClose: () => void;
}

// Single-use icons (only ever rendered here) - same convention
// IconRail.tsx already established for its own single-use icons.
// Lucide's own "search"/"file" (https://lucide.dev, ISC licensed),
// 16x16 with a 1.75 stroke, matching every other row-level icon's own
// convention in this app.
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
    </svg>
  );
}

// The one non-"page" value real content ever carries today (agent's
// own migration stamps every existing page "page"; no theme template
// sets anything else yet) - shown as a label only when a page's own
// type differs from this, so the label reads as "notable, not the
// ordinary case" rather than appearing on every single result.
const DEFAULT_TYPE = 'page';

function typeLabel(type: string): string | null {
  if (type === DEFAULT_TYPE || type.trim() === '') {
    return null;
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// Reuses the same siteId/path/url shape PagesTabPanel.tsx's own
// editorHref build does - not extracted into a shared helper, since
// it's a one-line construction and this is its only other call site
// so far.
function buildEditorHref(siteId: string, entry: ContentListEntry): string {
  const params = new URLSearchParams({ path: entry.path });
  if (entry.url !== null) {
    params.set('url', entry.url);
  }
  return `/sites/${siteId}/editor?${params.toString()}`;
}

// AppShell.tsx's own address bar, turned into a page search - clicking
// it opens this in place of the previous plain static display
// (requested directly, with a mockup). Fetches the site's own content
// list fresh on every open (listSiteContent, the same call
// PagesTabPanel.tsx's own Pages tree already makes) rather than
// caching across opens - real sites are small (tens of pages, not
// thousands), so a fresh fetch each time is simpler than inventing
// invalidation logic for what's a rarely-reopened, cheap request.
export function AddressBarSearchModal({ siteId, domainLabel, anchorRect, onClose }: AddressBarSearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<ContentListEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSiteContent(siteId, {})
      .then((result) => {
        if (!cancelled) {
          setEntries(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load pages');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Escape closes, matching every other dismissible overlay's own
  // expectation for a search box specifically - this app's existing
  // modals (NewPageModal.tsx etc) only ever close via an explicit
  // button, but none of them are a quick, low-commitment "look
  // something up and dismiss" interaction the way this one is.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const trimmedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (trimmedQuery === '' || entries === null) {
      return [];
    }
    return entries.filter(
      (entry) => entry.name.toLowerCase().includes(trimmedQuery) || entry.title.toLowerCase().includes(trimmedQuery),
    );
  }, [entries, trimmedQuery]);

  function handleSelect(entry: ContentListEntry): void {
    navigate(buildEditorHref(siteId, entry));
    onClose();
  }

  return (
    <>
      <div className="address-search-overlay" onClick={onClose} />
      <div
        className="address-search-box"
        role="dialog"
        aria-modal="true"
        aria-label="Search pages"
        data-theme="light"
        style={{ top: anchorRect.top, left: anchorRect.left, width: anchorRect.width }}
      >
        <div className="address-search-input-row">
          <span className="address-search-input-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search pages"
            autoFocus
          />
          <button type="button" className="address-search-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {trimmedQuery === '' ? (
          <div className="address-search-empty">
            <span className="address-search-empty-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <p>Search for pages in {domainLabel}</p>
          </div>
        ) : loadError ? (
          <p role="alert" className="address-search-message">
            {loadError}
          </p>
        ) : entries === null ? (
          <p className="address-search-message">Loading...</p>
        ) : results.length === 0 ? (
          <p className="address-search-message">No pages match &quot;{query}&quot;</p>
        ) : (
          <ul className="address-search-results">
            {results.map((entry) => (
              <li key={entry.path}>
                <button type="button" className="address-search-result" onClick={() => handleSelect(entry)}>
                  <span className="address-search-result-icon" aria-hidden="true">
                    <FileIcon />
                  </span>
                  <span className="address-search-result-text">
                    <span className="address-search-result-name">{entry.name || entry.title}</span>
                    <span className="address-search-result-path">{entry.url ?? entry.path}</span>
                  </span>
                  {typeLabel(entry.type) && <span className="address-search-result-type">{typeLabel(entry.type)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
