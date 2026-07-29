export type SiteEditorErrorReason =
  | 'not-found'
  | 'unreachable'
  | 'unauthorized'
  | 'error'
  | 'conflict'
  | 'precondition-required'
  | 'invalid';

export class SiteEditorError extends Error {
  readonly reason: SiteEditorErrorReason;

  constructor(reason: SiteEditorErrorReason, message: string) {
    super(message);
    this.name = 'SiteEditorError';
    this.reason = reason;
  }
}

export interface ReadResult {
  content: string;
  etag: string;
  source: 'draft' | 'live';
}

function isReason(value: unknown): value is SiteEditorErrorReason {
  return (
    value === 'not-found' ||
    value === 'unreachable' ||
    value === 'unauthorized' ||
    value === 'error' ||
    value === 'conflict' ||
    value === 'precondition-required' ||
    value === 'invalid'
  );
}

// The content path (e.g. "pages/about.json") travels as real path
// segments in the admin's own wildcard route, not as a single opaque
// query value - each segment is escaped individually so the slashes
// stay real path separators.
function encodePathSegments(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function reasonFromResponse(response: Response, fallback: SiteEditorErrorReason): Promise<SiteEditorError> {
  let message = 'Something went wrong';
  let reason: SiteEditorErrorReason = fallback;
  try {
    const body = (await response.json()) as { error?: string; message?: string; reason?: unknown };
    message = body.error ?? body.message ?? message;
    if (isReason(body.reason)) {
      reason = body.reason;
    }
  } catch {
    // Use the defaults above - the body wasn't valid JSON.
  }
  return new SiteEditorError(reason, message);
}

export async function readSiteEditorContent(siteId: string, path: string): Promise<ReadResult> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/content/${encodePathSegments(path)}`);

  if (response.status === 404) {
    throw await reasonFromResponse(response, 'not-found');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }

  const etag = response.headers.get('etag');
  const source = response.headers.get('x-content-source');
  if (!etag || (source !== 'draft' && source !== 'live')) {
    throw new SiteEditorError('error', 'The site did not return the expected headers');
  }

  return { content: await response.text(), etag, source };
}

export async function saveSiteDraft(siteId: string, path: string, content: string, etag: string): Promise<string> {
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/drafts/${encodePathSegments(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': etag },
    body: content,
  });

  if (response.status === 409) {
    throw await reasonFromResponse(response, 'conflict');
  }
  if (response.status === 428) {
    throw await reasonFromResponse(response, 'precondition-required');
  }
  if (response.status === 400) {
    throw await reasonFromResponse(response, 'invalid');
  }
  if (!response.ok) {
    throw await reasonFromResponse(response, 'error');
  }

  const newEtag = response.headers.get('etag');
  if (!newEtag) {
    throw new SiteEditorError('error', 'The site did not return a new ETag after saving');
  }
  return newEtag;
}
