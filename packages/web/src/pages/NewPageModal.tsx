import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { saveSiteDraft, SiteEditorError } from '../api/site-editor.ts';
import { fetchSitePageTemplates, type PageTemplate } from '../api/site-page-templates.ts';
import { listSiteContent, type ContentListEntry } from '../api/site-content.ts';
import { CloseIcon } from '../sections/CloseIcon.tsx';
import { relativePagePath } from './pageTree.ts';
import { slugify } from './slugify.ts';

export interface NewPageModalProps {
  siteId: string;
  onClose: () => void;
}

// "Always 6 for newly-authored content" - app-granite-cms's own
// docs/guide-content-authoring.md. Not the exact number a template's
// own file happens to declare (see buildPageContent below) - every
// page this modal creates, template or blank, is authored fresh right
// now. No live source to read this from yet (the site's own
// GET /v1/capabilities response isn't threaded into this modal) -
// bump this by hand alongside app-granite-cms's own
// CURRENT_SCHEMA_VERSION until it is.
const PAGE_SCHEMA_VERSION = 6;

const BLANK_PAGE_BASE = { type: 'page', layout: 'theme', sections: [] };

// A page created from a template keeps everything about it (sections,
// layout, any other fields) except the parts that are always specific
// to THIS new page, never carried over from the template file: its own
// name/title (whatever the user typed here, not the template's own),
// schemaVersion (always freshly-authored, not whatever the template
// happened to declare), and published (always false - never create
// something already live, regardless of what the template file says).
function buildPageContent(title: string, templateContent: unknown): Record<string, unknown> {
  const base = (typeof templateContent === 'object' && templateContent !== null ? templateContent : BLANK_PAGE_BASE) as Record<
    string,
    unknown
  >;
  return { ...base, schemaVersion: PAGE_SCHEMA_VERSION, name: title, title, published: false };
}

// v1 pages created through this modal are always flat under pages/ (no
// nested-page creation yet - a deliberate scope cut, not an oversight),
// so path -> url is always this same trivial strip, never the agent's
// own general urlToPagePath/pagePathToUrl.
function deriveUrlFromPath(path: string): string {
  const withoutPrefix = path.startsWith('pages/') ? path.slice('pages/'.length) : path;
  return `/${withoutPrefix.replace(/\.json$/, '')}`;
}

// One step, not the previous two-step template-grid-then-details
// wizard (requested directly): a small dialog with Title, an
// optional Template dropdown, and a Parent dropdown. The
// slug is derived from the title and never shown as an editable field
// here - PageMetadataPanel is where a page's slug gets changed after
// the fact.
//
// Nesting is purely path-based, with no parent id anywhere in the
// content model: a child of pages/about.json is pages/about/<slug>.json,
// which the agent's own pagePathToUrl resolves at /about/<slug>. That
// is the same directory-prefix relationship buildPageTree already
// reads the Pages tree from, so choosing a parent here is literally
// just choosing a path prefix.
//
// Creating the page is the same PUT /v1/drafts/* every other save
// already goes through (saveSiteDraft, unchanged) - the placeholder
// '*' If-Match can never match a real file's etag, so attempting to
// create at an already-occupied path naturally 409s through the
// existing conflict handling below, rather than needing a separate
// pre-flight existence check.

// pages/index.json and pages/404.json are excluded as parent options
// (requested directly). Both are hardcoded in the agent's renderer
// (public.ts resolves '/' to index.json and falls back to 404.json),
// and nesting under Home would produce pages/index/<slug>.json, which
// resolves at /index/<slug> rather than the /<slug> anyone choosing
// "Home" would expect - a URL that silently isn't what was asked for.
const NON_PARENT_PAGE_PATHS = ['pages/index.json', 'pages/404.json'];

export function NewPageModal({ siteId, onClose }: NewPageModalProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  // '' is the blank-page sentinel, matching the "" value on its own
  // <option> - a select's value is always a string, so null can't ride
  // through one directly the way the old grid's own card id could.
  const [templateId, setTemplateId] = useState('');
  // '' is "None", a page created at the top level.
  const [parentPath, setParentPath] = useState('');
  const [templates, setTemplates] = useState<PageTemplate[] | null>(null);
  const [pages, setPages] = useState<ContentListEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A failed fetch here is treated the same as a theme with no
  // templates folder at all - the dropdown just doesn't appear, rather
  // than surfacing a scary error for what's an enhancement, not the
  // point of this modal.
  useEffect(() => {
    let cancelled = false;
    fetchSitePageTemplates(siteId)
      .then((result) => {
        if (!cancelled) {
          setTemplates(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTemplates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  // Same treatment for the parent list: a failure leaves the dropdown
  // with just "None", so a page can still always be created at the top
  // level even if this call fails outright.
  useEffect(() => {
    let cancelled = false;
    listSiteContent(siteId, { type: 'page' })
      .then((result) => {
        if (!cancelled) {
          setPages(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const parentOptions = (pages ?? [])
    .filter((entry) => !NON_PARENT_PAGE_PATHS.includes(entry.path))
    .slice()
    .sort((a, b) => (a.name || a.path).localeCompare(b.name || b.path));

  // The whole path, derived: parent's own stem as the directory
  // prefix, then the title's slug. Empty while the title is, which is
  // what disables Create below - a page with no title has no slug, and
  // so no path to be created at.
  const slug = slugify(title);
  const parentStem = parentPath === '' ? '' : relativePagePath(parentPath).replace(/\.json$/, '');
  const derivedPath = slug === '' ? '' : `pages/${parentStem === '' ? '' : `${parentStem}/`}${slug}.json`;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const trimmedTitle = title.trim();
    const template = templates?.find((entry) => entry.id === templateId) ?? null;

    try {
      const content = buildPageContent(trimmedTitle, template?.content ?? BLANK_PAGE_BASE);
      await saveSiteDraft(siteId, derivedPath, JSON.stringify(content, null, 2), '*');
      navigate(`/sites/${siteId}/editor?path=${encodeURIComponent(derivedPath)}&url=${encodeURIComponent(deriveUrlFromPath(derivedPath))}`);
    } catch (err) {
      if (err instanceof SiteEditorError && err.reason === 'conflict') {
        setError('A page already exists at that path');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create that page');
      }
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      {/* Separate gradient header with its own close icon, then a
          content area with more room above and below than at the
          sides, then an even 50/50 action row (requested directly,
          with a mockup) - all of it dialog.css, shared with the grid
          pickers' own header. */}
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-page-heading">
        <div className="dialog-header">
          <div className="dialog-header-title-row">
            <h2 id="new-page-heading">New Page</h2>
            <button type="button" className="dialog-header-close" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="dialog-content">
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label>
              Title
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
            </label>
            {/* Hidden entirely when the theme declares no templates -
                "Blank page" would be the only choice, and a dropdown with
                one fixed option is just noise (the same reasoning
                BlockList.tsx already applies to a single block type). */}
            {(templates ?? []).length > 0 && (
              <label>
                Template
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  <option value="">Blank page</option>
                  {(templates ?? []).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Parent
              <select value={parentPath} onChange={(event) => setParentPath(event.target.value)}>
                <option value="">None</option>
                {parentOptions.map((entry) => (
                  <option key={entry.path} value={entry.path}>
                    {entry.name || entry.path}
                  </option>
                ))}
              </select>
            </label>
            {derivedPath !== '' && <p>This page will be created at {deriveUrlFromPath(derivedPath)}</p>}
            {error && <p role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="button-primary" disabled={busy || derivedPath === ''}>
                Create
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
