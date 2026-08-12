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

// A short, human label for a page, for use in contexts (like the
// auto-generated publish message) that need something readable rather
// than a raw content path. Prefers "name" (the admin's own label, distinct
// from the rendered "title" - see PageMetadataPanel.tsx), falls back to
// "title", then to the path itself if the content has neither or isn't
// valid JSON.
export function derivePageLabel(content: string, path: string): string {
  const parsed = parseObject(content);
  const name = parsed?.name;
  if (typeof name === 'string' && name.trim() !== '') {
    return name;
  }
  const title = parsed?.title;
  if (typeof title === 'string' && title.trim() !== '') {
    return title;
  }
  return path;
}

// Content saved before "name" became a required page field (Group J)
// has no name property at all - saving it back unmodified is then
// rejected by the site's own schema validation on every single save,
// not just the first. Quietly backfills name from title, the same
// fallback content-read.ts's own listing endpoint already applies for
// display, but applied here at the point that actually unblocks
// saving. Only when "name" is genuinely absent (not merely blank) -
// an explicit blank name the user typed should surface its own
// validation error, not be silently overwritten. Returns the input
// unchanged if there's nothing to backfill, so this never reformats
// content it didn't need to touch.
export function backfillPageName(content: string): string {
  const parsed = parseObject(content);
  if (!parsed || 'name' in parsed) {
    return content;
  }
  const title = parsed.title;
  if (typeof title !== 'string' || title.trim() === '') {
    return content;
  }
  return JSON.stringify({ ...parsed, name: title }, null, 2);
}
