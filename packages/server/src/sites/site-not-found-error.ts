// Same shape as require-auth.ts's AuthError: statusCode set explicitly
// in the constructor so the existing global error handler (server.ts)
// passes this through with its real message intact, never sanitising
// it as a generic 500.
export class SiteNotFoundError extends Error {
  readonly statusCode: number;
  // Forwarded by server.ts's handleError - lets every frontend
  // consumer (ContentBrowserPage/MenusPage's SiteContentError,
  // useAutosaveDraft's SiteEditorError, and friends) tell "the site
  // itself isn't registered/accessible" apart from a same-shaped 404
  // for a content path that just doesn't exist within a real,
  // reachable site - the two need very different messaging/actions.
  readonly reason = 'site-not-found';

  constructor(id: string) {
    super(`No registered site with id "${id}"`);
    this.name = 'SiteNotFoundError';
    this.statusCode = 404;
  }
}
