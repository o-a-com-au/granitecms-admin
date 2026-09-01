import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { saveSiteDraft, SiteEditorError } from '../api/site-editor.ts';
import { fetchSitePageTemplates, type PageTemplate } from '../api/site-page-templates.ts';
import { slugify } from './slugify.ts';

export interface NewPageModalProps {
  siteId: string;
  onClose: () => void;
}

// "Always 5 for newly-authored content" - app-granite-cms's own
// docs/content-authoring-guide.md. Not the exact number a template's
// own file happens to declare (see buildPageContent below) - every
// page this modal creates, template or blank, is authored fresh right
// now.
const PAGE_SCHEMA_VERSION = 5;

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

// Group Q, revised to a two-step wizard matching AddSectionModal's own
// grid picker (requested directly, "similar to the Add Section
// popup"): step one is a centred grid of template cards - a "Blank
// page" card always first, then whatever real templates this site's
// theme declares - and clicking one both records the selection and
// advances to step two, the actual Title/Path form (reusing plain
// .modal/.modal-actions, RedirectFormModal.tsx's own precedent,
// rather than the grid step's wider .add-section-modal sizing - a
// two-field form doesn't need that much room). No auto-skip to step
// two when a theme has no real templates - the grid still renders
// with just the one Blank page card, simpler than adding a second
// code path and avoiding a race against the template fetch (skipping
// the instant it resolves to empty could otherwise yank a user already
// looking at the grid onto the form beneath them).
// Creating the page is the same PUT /v1/drafts/* every other save
// already goes through (saveSiteDraft, unchanged) - the placeholder
// '*' If-Match can never match a real file's etag, so attempting to
// create at an already-occupied path naturally 409s through the
// existing conflict handling below, rather than needing a separate
// pre-flight existence check.
export function NewPageModal({ siteId, onClose }: NewPageModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'template' | 'details'>('template');
  const [title, setTitle] = useState('');
  const [path, setPath] = useState('');
  const [pathTouched, setPathTouched] = useState(false);
  const [templates, setTemplates] = useState<PageTemplate[] | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A failed fetch here is treated the same as a theme with no
  // templates folder at all - the picker step just doesn't appear,
  // rather than surfacing a scary error for what's an enhancement, not
  // the point of this modal.
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

  // Live-follows Title until the user types into Path directly
  // themselves - same pattern as PageMetadataPanel.tsx's own
  // slug-follows-Name behaviour.
  const suggestedPath = title.trim() === '' ? '' : `pages/${slugify(title)}.json`;
  const displayedPath = pathTouched ? path : suggestedPath;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const trimmedTitle = title.trim();
    const trimmedPath = displayedPath.trim();
    const template = templates?.find((entry) => entry.id === selectedTemplateId) ?? null;

    try {
      const content = buildPageContent(trimmedTitle, template?.content ?? BLANK_PAGE_BASE);
      await saveSiteDraft(siteId, trimmedPath, JSON.stringify(content, null, 2), '*');
      navigate(`/sites/${siteId}/editor?path=${encodeURIComponent(trimmedPath)}&url=${encodeURIComponent(deriveUrlFromPath(trimmedPath))}`);
    } catch (err) {
      if (err instanceof SiteEditorError && err.reason === 'conflict') {
        setError('A page already exists at that path');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create that page');
      }
      setBusy(false);
    }
  }

  function handleSelectTemplate(templateId: string | null): void {
    setSelectedTemplateId(templateId);
    setStep('details');
  }

  if (step === 'template') {
    return (
      <div className="modal-overlay">
        <div className="add-section-modal" role="dialog" aria-modal="true" aria-labelledby="new-page-heading">
          <div className="add-section-modal-header">
            <h2 id="new-page-heading">New Page</h2>
            <button type="button" className="add-section-modal-close" aria-label="Close" onClick={onClose}>
              &times;
            </button>
          </div>
          <div className="add-section-grid">
            <button type="button" className="add-section-item" onClick={() => handleSelectTemplate(null)}>
              <span className="add-section-item-thumb" aria-hidden="true" />
              <span className="add-section-item-name">Blank page</span>
            </button>
            {(templates ?? []).map((template) => (
              <button key={template.id} type="button" className="add-section-item" onClick={() => handleSelectTemplate(template.id)}>
                <span className="add-section-item-thumb" aria-hidden="true" />
                <span className="add-section-item-name">{template.title}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-page-heading">
        <div className="new-page-details-header">
          <button type="button" className="new-page-back" onClick={() => setStep('template')} disabled={busy}>
            &lsaquo; Back
          </button>
          <h2 id="new-page-heading">New Page</h2>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Title
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
          </label>
          <label>
            Path
            <input
              type="text"
              placeholder="pages/my-new-page.json"
              value={displayedPath}
              onChange={(event) => {
                setPath(event.target.value);
                setPathTouched(true);
              }}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={busy}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
