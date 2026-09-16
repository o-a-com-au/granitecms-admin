import { useEffect, useState, type FormEvent } from 'react';
import { readSiteEditorContent, saveSiteDraft, SiteEditorError } from '../api/site-editor.ts';
import { publishSiteDraft } from '../api/site-publishing.ts';
import { NON_PARENT_PAGE_PATHS } from './protectedPages.ts';
import { fetchSitePageTemplates, type PageTemplate } from '../api/site-page-templates.ts';
import { listSiteContent, type ContentListEntry } from '../api/site-content.ts';
import { CloseIcon } from '../sections/CloseIcon.tsx';
import { pageParentPath, relativePagePath } from './pageTree.ts';
import { slugify } from './slugify.ts';
import { normalisePageType } from './pageType.ts';

export interface NewPageModalProps {
  siteId: string;
  onClose: () => void;
  // Preselects the Parent dropdown - the Pages tree's own "Create
  // Child Page" row action opens this modal already pointed at the row
  // it was invoked from. Absent means the usual "None" (top level).
  // The value is a page path (e.g. "pages/about.json"), the same shape
  // the dropdown's own option values use.
  initialParentPath?: string;
  // Turns this into the Duplicate Page dialog: the same fields, but the
  // new page's content is copied from this entry instead of coming from
  // a template, so the Template dropdown is hidden and the Title starts
  // as "<name> (Copy)".
  duplicateFrom?: ContentListEntry;
  // Called once the page really exists, with its path and url. The
  // caller decides what happens next - today that is staying on the
  // Pages panel and revealing the new row, rather than this dialog
  // navigating away to the editor on its own (requested directly).
  onCreated: (path: string, url: string) => void;
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

// A page created from a template - or copied from another page - keeps
// everything about its source (sections, layout, any other fields)
// except the parts that are always specific to THIS new page and never
// carried over: its own name/title (whatever the user typed here, not
// the source's), schemaVersion (always freshly-authored, whatever the
// source happened to declare), and published, which now comes from the
// dialog's own Status dropdown rather than being forced false. A
// duplicate of a live page is emphatically not live itself unless the
// user says so.
function buildPageContent(title: string, sourceContent: unknown, published: boolean, type: string): Record<string, unknown> {
  const base = (typeof sourceContent === 'object' && sourceContent !== null ? sourceContent : BLANK_PAGE_BASE) as Record<
    string,
    unknown
  >;
  // type last so the dialog's own choice wins over whatever the
  // template or duplicated page happened to declare.
  return { ...base, schemaVersion: PAGE_SCHEMA_VERSION, name: title, title, published, type };
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

export function NewPageModal({ siteId, onClose, initialParentPath, duplicateFrom, onCreated }: NewPageModalProps) {
  const duplicating = duplicateFrom !== undefined;
  // A duplicate opens with a name that is already valid and already
  // distinct from its source, so Create is reachable immediately and
  // the slug cannot collide with the page being copied.
  const [title, setTitle] = useState(duplicateFrom ? `${duplicateFrom.name || duplicateFrom.path} (Copy)` : '');
  // '' is the blank-page sentinel, matching the "" value on its own
  // <option> - a select's value is always a string, so null can't ride
  // through one directly the way the old grid's own card id could.
  const [templateId, setTemplateId] = useState('');
  // '' is "None", a page created at the top level. Seeded from
  // initialParentPath when the caller opened this against a specific
  // row. Only the initial value: the dropdown stays freely editable
  // afterwards, so a preselected parent is a starting point, not a
  // lock.
  // A duplicate defaults to sitting beside its source rather than at
  // the top level, which is almost always where a copy belongs.
  const [parentPath, setParentPath] = useState(
    duplicateFrom ? (pageParentPath(duplicateFrom.path) ?? '') : (initialParentPath ?? ''),
  );
  // Draft by default for both modes: creating something instantly live
  // should always be the deliberate choice, never the default.
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  // Carried into the created file but never shown here (requested
  // directly): a template and a page type were two adjacent choices at
  // creation and read as the same decision twice. The template is the
  // one choice now, and its own declared type rides along with it.
  // Page Meta is where a type gets corrected afterwards.
  const [pageType, setPageType] = useState(duplicateFrom?.type || 'page');
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
  //
  // Deliberately NOT filtered by { type: 'page' }: "type" is the page's
  // own content type, which real sites genuinely vary (demo-architecture
  // types its project pages "project"), so filtering on it silently hid
  // every such page from this dropdown while the Pages tree beside it
  // listed them - you could see a page you could not nest under.
  // Filtering to the pages/ prefix instead keeps every page whatever its
  // type, and drops menus, which share this same listing. A positive
  // prefix test rather than the tree's own isMenuPath exclusion: the
  // parent-path arithmetic below (relativePagePath/pageParentPath)
  // assumes that prefix, so this guarantees the shape it relies on.
  useEffect(() => {
    let cancelled = false;
    listSiteContent(siteId, {})
      .then((result) => {
        if (!cancelled) {
          setPages(result.filter((entry) => entry.path.startsWith('pages/')));
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
      // Duplicating reads whatever the editor itself would show for the
      // source page, which is its draft when one exists and the live
      // file otherwise - copying the version the user can currently see
      // rather than a published one they may not recognise.
      let source: unknown = template?.content ?? BLANK_PAGE_BASE;
      if (duplicateFrom) {
        const read = await readSiteEditorContent(siteId, duplicateFrom.path);
        source = JSON.parse(read.content);
      }
      const content = buildPageContent(trimmedTitle, source, status === 'published', normalisePageType(pageType));
      await saveSiteDraft(siteId, derivedPath, JSON.stringify(content, null, 2), '*');

      // Publishing is a second, separate step: the page exists as a
      // draft the moment the save above succeeds, so a failure here
      // leaves a real page behind and must say so rather than reading
      // as "nothing happened". Safe to do unconditionally for a page
      // this dialog just created - unlike toggling an existing page,
      // there can be no unrelated draft to publish by accident.
      if (status === 'published') {
        try {
          await publishSiteDraft(siteId, derivedPath, `Create ${trimmedTitle}`);
        } catch (publishErr) {
          setError(
            `The page was created as a draft, but publishing it failed: ${
              publishErr instanceof Error ? publishErr.message : 'unknown error'
            }`,
          );
          setBusy(false);
          return;
        }
      }
      onCreated(derivedPath, deriveUrlFromPath(derivedPath));
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
            <h2 id="new-page-heading">{duplicating ? 'Duplicate Page' : 'New Page'}</h2>
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
            {!duplicating && (templates ?? []).length > 0 && (
              <label>
                Template
                <select
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                    // The template is the only thing that sets the type
                    // now, so this applies unconditionally.
                    const chosen = (templates ?? []).find((entry) => entry.id === event.target.value);
                    const declared = (chosen?.content as { type?: unknown } | undefined)?.type;
                    setPageType(typeof declared === 'string' && declared !== '' ? declared : 'page');
                  }}
                >
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
            {/* Paired on one row (requested directly): both answer
                "where does this page show up", and neither needs the
                full dialog width. */}
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value as 'draft' | 'published')}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            {derivedPath !== '' && <p>This page will be created at {deriveUrlFromPath(derivedPath)}</p>}
            {error && <p role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="button-primary" disabled={busy || derivedPath === ''}>
                {duplicating ? 'Duplicate' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
