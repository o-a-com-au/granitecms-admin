export type SiteEditorErrorReason =
  | 'not-found'
  | 'unreachable'
  | 'unauthorized'
  | 'error'
  | 'conflict'
  | 'precondition-required'
  | 'invalid'
  | 'unsupported-type'
  | 'too-large';

// Group I, I5: the real ajv errors (already field-pointing, e.g.
// /sections/0/settings/heading), forwarded all the way from the
// agent's own draft-save 400 body.
export interface ValidationFieldError {
  path: string;
  message: string;
  keyword: string;
}

export class SiteEditorError extends Error {
  readonly reason: SiteEditorErrorReason;
  readonly validationErrors?: ValidationFieldError[];

  constructor(reason: SiteEditorErrorReason, message: string, validationErrors?: ValidationFieldError[]) {
    super(message);
    this.name = 'SiteEditorError';
    this.reason = reason;
    this.validationErrors = validationErrors;
  }
}

function isValidationFieldError(value: unknown): value is ValidationFieldError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.path === 'string' && typeof record.message === 'string' && typeof record.keyword === 'string';
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
    value === 'invalid' ||
    value === 'unsupported-type' ||
    value === 'too-large'
  );
}

// The content path (e.g. "pages/about.json") travels as real path
// segments in the admin's own wildcard route, not as a single opaque
// query value - each segment is escaped individually so the slashes
// stay real path separators. Exported for reuse by site-publishing.ts,
// which addresses the same path-keyed routes.
export function encodePathSegments(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export async function reasonFromResponse(response: Response, fallback: SiteEditorErrorReason): Promise<SiteEditorError> {
  let message = 'Something went wrong';
  let reason: SiteEditorErrorReason = fallback;
  let validationErrors: ValidationFieldError[] | undefined;
  try {
    const body = (await response.json()) as { error?: string; message?: string; reason?: unknown; errors?: unknown };
    // "message" is the specific, useful reason ("A page already exists
    // at that path"); "error" is just the generic HTTP status phrase
    // ("Conflict", "Bad Request") every server error response also
    // carries. Preferring message over error is what actually surfaces
    // why a save/publish failed, instead of a status phrase that's
    // never more informative than the field it was masking.
    message = body.message ?? body.error ?? message;
    if (isReason(body.reason)) {
      reason = body.reason;
    }
    if (Array.isArray(body.errors) && body.errors.every(isValidationFieldError)) {
      validationErrors = body.errors;
    }
  } catch {
    // Use the defaults above - the body wasn't valid JSON.
  }
  return new SiteEditorError(reason, message, validationErrors);
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
