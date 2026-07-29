import type { FetchSiteResult } from './fetch-site.ts';

// Shared between the read and write editor routes (site-editor-content.ts,
// site-draft-save.ts): only two outcomes genuinely need interpretation -
// no response at all, and 401/403 (this codebase's 401 is reserved for
// the admin's own session - see require-auth.ts - so a downstream site's
// 401/403 must be remapped, matching the precedent already set in
// site-content.ts). Every other status (200, 404, 409, 428, 400) the
// site already produced the correct status and a correctly-shaped
// {statusCode, error, message} body - forwarded byte-for-byte rather
// than reinterpreted, unlike site-status.ts/site-content.ts which
// genuinely need their own richer interpretation of a successful body.
export type InterpretedSiteResponse =
  | { outcome: 'unreachable' }
  | { outcome: 'unauthorized' }
  | { outcome: 'forwarded'; status: number; etag: string | null; body: ArrayBuffer };

export async function interpretSiteResponse(result: FetchSiteResult): Promise<InterpretedSiteResponse> {
  if (result.outcome === 'unreachable') {
    return { outcome: 'unreachable' };
  }

  const { response } = result;
  if (response.status === 401 || response.status === 403) {
    return { outcome: 'unauthorized' };
  }

  return {
    outcome: 'forwarded',
    status: response.status,
    etag: response.headers.get('etag'),
    body: await response.arrayBuffer(),
  };
}
