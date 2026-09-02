import { useState } from 'react';
import { moveSitePage } from '../api/site-publishing.ts';
import { SiteEditorError } from '../api/site-editor.ts';
import { slugify } from '../pages/slugify.ts';

export interface PageMetadataPanelProps {
  content: string;
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
  setContent,
  siteId,
  path,
  previewUrl,
  renameDisabled,
  onRenamed,
}: PageMetadataPanelProps) {
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [publishDate, setPublishDate] = useState('');
  const [slugValue, setSlugValue] = useState(() => currentSlug(path));
  const [slugTouched, setSlugTouched] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const title = readTitle(content);
  const titleEditable = writeTitle(content, title) !== null;
  const name = readName(content);
  const nameEditable = writeName(content, name) !== null;
  const published = readPublished(content);
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
  const canRename = !renameDisabled && previewUrl !== null && !renameBusy;
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
      <label>
        Slug
        <input
          value={displayedSlug}
          disabled={renameDisabled || renameBusy}
          onChange={(event) => {
            setSlugTouched(true);
            setSlugValue(event.target.value);
          }}
        />
      </label>
      {renameDisabled && <p>Save or discard your changes before changing the URL.</p>}
      {!renameDisabled && previewUrl !== null && slugChanged && (
        <p>
          This page will move to <code>{replaceLastSegment(previewUrl, displayedSlug)}</code>
        </p>
      )}
      {renameError && <p role="alert">{renameError}</p>}
      <button type="button" onClick={() => void handleApplySlug()} disabled={!canRename || !slugChanged}>
        {renameBusy ? 'Updating slug...' : 'Update slug'}
      </button>
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
        <input value={publishDate} onChange={(event) => setPublishDate(event.target.value)} />
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
