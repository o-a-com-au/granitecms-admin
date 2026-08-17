// Same shape as require-auth.ts's AuthError / sites/site-not-found-
// error.ts's SiteNotFoundError: statusCode set explicitly so the global
// error handler (server.ts) passes it through with its real message
// intact. Used only for role-gated routes with no specific resource to
// hide (register a site, invite/list/revoke client access) - a real
// 403, not the 404-collapse requireSiteAccess uses, since there's no
// per-resource existence to hide behind: the route itself is role-gated.
export class ForbiddenRoleError extends Error {
  readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenRoleError';
    this.statusCode = 403;
  }
}
