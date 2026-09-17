import { useState } from 'react';
import { Combobox } from '../components/Combobox.tsx';
import { moveSitePage } from '../api/site-publishing.ts';
import { SiteEditorError } from '../api/site-editor.ts';
import { slugify } from '../pages/slugify.ts';
import { displayPageType, normalisePageType } from '../pages/pageType.ts';
import { canChangePagePath } from '../pages/protectedPages.ts';

export interface PageMetadataPanelProps {
  content: string;
  // Every page type already in use on this site, for the Page type
  // combobox to suggest. Suggestions only - a brand new type is always
  // allowed, since nothing anywhere registers a fixed set. Optional:
  // with none supplied the field still works, it simply has nothing to
  // offer, which is better than a caller without a listing crashing the
  // whole panel.
  pageTypes?: string[];
  setContent: (value: string) => void;
  siteId: string;
  path: string;
  previewUrl: string | null;
  // Renaming never touches an open draft (prepareMovePage only ever
  // moves the live file - see move.ts) - rather than silently
  // orphaning a pending draft at its old path, the Slug field is
  // simply unavailable until there is nothing pending to lose.
  renameDisabled: boolean;
  onRenamed: (newPath: string, newUrl: string) => void;
}

function parseObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Reads/writes just the title field of whatever JSON the hook is
// currently holding - deliberately not tied to PageSectionsEditor's
// own stricter parsePage (which requires a sections array), since
// title is a generic page-level field that should still be editable
// here even for content that parsePage would reject.
function readTitle(content: string): string {
  const parsed = parseObject(content);
  const title = parsed?.title;
  return typeof title === 'string' ? title : '';
}

// The page's own content type: required by the agent's page schema and
// indexed as page_type, which is what a theme filters on via
// GET /search.json?pageType=... - so this is the field that decides
// which listings a page appears in, not a cosmetic label. Free-form by
// design: several templates can legitimately share one type (a video
// article and a text article are both "article"), and nothing anywhere
// registers a fixed set.
function readType(content: string): string {
  const parsed = parseObject(content);
  const type = parsed?.type;
  return typeof type === 'string' ? type : '';
}

// Stored lowercase via normalisePageType, which also covers the empty
// case ("type" is required with minLength 1, so clearing the field
// falls back to "page" rather than producing content the site would
// reject). The field displays it capitalised - see pageType.ts for why
// the two directions have to stay symmetric.
function writeType(content: string, type: string): string | null {
  const parsed = parseObject(content);
  return parsed ? JSON.stringify({ ...parsed, type: normalisePageType(type) }, null, 2) : null;
}

// I6: same save path as everything else - parse, mutate a clone,
// stringify, call the hook's own setContent. If content isn't a plain
// JSON object (or isn't valid JSON at all), the field is disabled
// rather than silently discarding whatever the user typed.
function writeTitle(content: string, title: string): string | null {
  const parsed = parseObject(content);
  return parsed ? JSON.stringify({ ...parsed, title }, null, 2) : null;
}

// "name" is the admin's own label for this page (shown in the page
// tree), distinct from "title" (the rendered <title>/heading) - same
// read/write shape as title, just a different field, so a page can be
// called "Home Page" in the tree while its real <title> says
// something else entirely.
function readName(content: string): string {
  const parsed = parseObject(content);
  const name = parsed?.name;
  return typeof name === 'string' ? name : '';
}

function writeName(content: string, name: string): string | null {
  const parsed = parseObject(content);
  return parsed ? JSON.stringify({ ...parsed, name }, null, 2) : null;
}

// The published flag - the same field the "Published" checkbox on the
// Sections tab already edits (PageSectionsEditor.tsx), just presented
// here as a Draft/Published status dropdown per docs/design/Metadata.png.
// It's a pure content field: selecting "Published" only changes what's
// in the draft, the same as ticking a checkbox would - it does not
// itself commit anything. Saving the draft live is still the separate
// Save action (docs/design/Metadata.png's own top-bar button).
function readPublished(content: string): boolean {
  return parseObject(content)?.published === true;
}

function writePublished(content: string, published: boolean): string | null {
  const parsed = parseObject(content);
  return parsed ? JSON.stringify({ ...parsed, published }, null, 2) : null;
}

// publishDate is a real content field (page.schema.json: optional,
// string, minLength 1) that this panel had never actually written - it
// was local state only, so anything typed was discarded on remount.
// Now read from and written to content like every other real field.
//
// Stored as plain YYYY-MM-DD, which is what <input type="date"> both
// produces and consumes, what every existing page on disk already
// carries ("2021-08-02"), and what the agent's own index parses into a
// number for date sorting (parseDateValue, rebuild-index.ts). Not
// datetime-local, which would emit "2021-08-02T09:30" - a different
// shape from everything already stored.
function readPublishDate(content: string): string {
  const value = parseObject(content)?.publishDate;
  return typeof value === 'string' ? value : '';
}

// Clearing the field DELETES the key rather than writing "" - the
// schema requires minLength 1, so an empty string would be content the
// site itself rejects on save. The field is optional, so absent is the
// correct representation of "not set".
function writePublishDate(content: string, publishDate: string): string | null {
  const parsed = parseObject(content);
  if (!parsed) {
    return null;
  }
  const next = { ...parsed };
  if (publishDate === '') {
    delete next.publishDate;
  } else {
    next.publishDate = publishDate;
  }
  return JSON.stringify(next, null, 2);
}

// The page's own directory-stem slug - "pages/about/team.json" ->
// "team". Both a content path and a URL share the identical directory
// structure (a URL is just the path with "pages/" stripped and
// ".json" stripped, per the agent's own pagePathToUrl), so the same
// last-segment logic applies to both, just with a different suffix
// appended back on for the path case.
function currentSlug(path: string): string {
  const stem = path.replace(/\.json$/, '');
  const segments = stem.split('/');
  return segments[segments.length - 1] ?? '';
}

function replaceLastSegment(value: string, newSegment: string): string {
  const segments = value.split('/');
  segments[segments.length - 1] = newSegment;
  return segments.join('/');
}

// The remaining fields on this panel (meta description, author,
// publish date) are still a visual placeholder only, matching
// docs/design/Metadata.png - Group I's own scope decision only gave
// title/published real structured fields, and the rest would need a
// real design/schema decision before they can persist anywhere.
// Local-only state, so typing "works" in the sense of being
// interactive, but nothing is saved.
export function PageMetadataPanel({
  content,
  pageTypes,
  setContent,
  siteId,
  path,
  previewUrl,
  renameDisabled,
  onRenamed,
}: PageMetadataPanelProps) {
  // description and author remain deliberate placeholders - local state
  // only, wired to nothing. publishDate no longer is.
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [slugValue, setSlugValue] = useState(() => currentSlug(path));
  const [slugTouched, setSlugTouched] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const title = readTitle(content);
  const titleEditable = writeTitle(content, title) !== null;
  const name = readName(content);
  const nameEditable = writeName(content, name) !== null;
  const published = readPublished(content);
  const publishDate = readPublishDate(content);
  const publishDateEditable = writePublishDate(content, publishDate) !== null;
  const pageType = readType(content);
  const pageTypeEditable = writeType(content, pageType) !== null;
  // The current value belongs in its own suggestion list even when no
  // other page uses it yet, so an unusual type is never missing from
  // the very page that has it.
  const typeOptions = [...new Set([...(pageTypes ?? []), pageType].filter((entry) => entry !== ''))].sort();
  const publishedEditable = writePublished(content, published) !== null;

  // The name this page already had when the editor opened - auto-
  // follow only kicks in once Name changes from *this* value, not
  // retroactively against whatever name/slug an already-published
  // page happens to already have. Without this, simply opening an
  // existing page whose name and slug happen to differ would
  // immediately show a "changed" slug and a wrongly-enabled Update
  // slug button, as if a rename were already pending.
  const [initialName] = useState(name);
  const slug = currentSlug(path);
  // Live-follows the Name field's slugified value once Name itself has
  // changed this session, until the user types into the slug field
  // directly - exactly like WordPress's own permalink editor.
  const displayedSlug = slugTouched ? slugValue : name !== initialName ? slugify(name) || slug : slug;
  // Home and 404 have fixed urls: the agent's renderer looks for them
  // at exactly pages/index.json and pages/404.json, so renaming either
  // does not move a page, it removes the one the renderer wanted - with
  // nothing in the UI afterwards to show for it. Kept separate from
  // renameDisabled, which is a temporary dirty-draft state that does
  // explain itself: this one is permanent for these two pages, so the
  // field is not rendered at all rather than disabled.
  const pathLocked = !canChangePagePath(path);
  const canRename = !renameDisabled && !pathLocked && previewUrl !== null && !renameBusy;
  const slugChanged = displayedSlug.trim() !== '' && displayedSlug !== slug;

  async function handleApplySlug(): Promise<void> {
    if (previewUrl === null || !slugChanged) {
      return;
    }
    const newUrl = replaceLastSegment(previewUrl, displayedSlug);
    const newPath = replaceLastSegment(path, `${displayedSlug}.json`);

    setRenameBusy(true);
    setRenameError(null);
    try {
      await moveSitePage(siteId, previewUrl, newUrl, `Change URL from ${previewUrl} to ${newUrl}`);
      setSlugTouched(false);
      onRenamed(newPath, newUrl);
    } catch (err) {
      setRenameError(
        err instanceof SiteEditorError ? err.message : err instanceof Error ? err.message : 'Failed to update the slug',
      );
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <div className="metadata-panel">
      <label>
        Name
        <input
          value={name}
          disabled={!nameEditable}
          onChange={(event) => {
            const updated = writeName(content, event.target.value);
            if (updated !== null) {
              setContent(updated);
            }
          }}
        />
      </label>
      {/* No Slug field at all on Home and 404 (requested directly).
          This first shipped as a disabled field with an explanation
          under it, but with no control left to act on, the explanation
          was only noise - so the whole group goes: the field, its
          messages, and the Update button. Everything inside here
          belongs to renaming and has nothing to do on a fixed url. */}
      {!pathLocked && (
        <>
          {/* Label above, input and Update side by side (requested
              directly, with a mockup). htmlFor/id rather than a
              wrapping <label>, as the Page type field above already
              does - a <button> inside a label is activated by clicks
              on the label text. .slug-field carries the label's own
              column layout so the two still read as one field; see
              base.css. */}
          <div className="slug-field">
            <label htmlFor="page-slug-field">Slug</label>
            <div className="slug-input-row">
              <input
                id="page-slug-field"
                value={displayedSlug}
                disabled={renameDisabled || renameBusy}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlugValue(event.target.value);
                }}
              />
              <button type="button" onClick={() => void handleApplySlug()} disabled={!canRename || !slugChanged}>
                {renameBusy ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
          {/* Both informational messages now read as notes belonging to
              the field above, with the rule aligned to its text. The
              error below deliberately keeps its plain role="alert"
              styling - muted grey note treatment would understate it. */}
          {renameDisabled && (
            <p className="panel-note panel-note-field">Save or discard your changes before changing the URL.</p>
          )}
          {!renameDisabled && previewUrl !== null && slugChanged && (
            <p className="panel-note panel-note-field">
              This page will move to {replaceLastSegment(previewUrl, displayedSlug)}
            </p>
          )}
          {renameError && <p role="alert">{renameError}</p>}
        </>
      )}
      <label>
        Page title
        <input
          value={title}
          disabled={!titleEditable}
          onChange={(event) => {
            const updated = writeTitle(content, event.target.value);
            if (updated !== null) {
              setContent(updated);
            }
          }}
        />
      </label>
      {/* Beside Status deliberately: both answer "where does this page
          show up", and neither is about its content. */}
      <label htmlFor="page-type-field">Page type</label>
      <Combobox
        id="page-type-field"
        value={displayPageType(pageType)}
        options={typeOptions.map(displayPageType)}
        disabled={!pageTypeEditable}
        onChange={(next) => {
          const updated = writeType(content, next);
          if (updated !== null) {
            setContent(updated);
          }
        }}
      />
      <p className="panel-note panel-note-field">
        Themes list pages by type, so changing this changes which listings include this page.
      </p>
      <label>
        Page meta description
        <textarea
          className="metadata-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label>
        Author
        <input value={author} onChange={(event) => setAuthor(event.target.value)} />
      </label>
      <label>
        Publish date
        <input
          type="date"
          value={publishDate}
          disabled={!publishDateEditable}
          onChange={(event) => {
            const updated = writePublishDate(content, event.target.value);
            if (updated !== null) {
              setContent(updated);
            }
          }}
        />
      </label>
      <label>
        Status
        <select
          value={published ? 'published' : 'draft'}
          disabled={!publishedEditable}
          onChange={(event) => {
            const updated = writePublished(content, event.target.value === 'published');
            if (updated !== null) {
              setContent(updated);
            }
          }}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
    </div>
  );
}
