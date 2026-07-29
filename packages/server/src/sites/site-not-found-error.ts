// Same shape as require-auth.ts's AuthError: statusCode set explicitly
// in the constructor so the existing global error handler (server.ts)
// passes this through with its real message intact, never sanitising
// it as a generic 500.
export class SiteNotFoundError extends Error {
  readonly statusCode: number;

  constructor(id: string) {
    super(`No registered site with id "${id}"`);
    this.name = 'SiteNotFoundError';
    this.statusCode = 404;
  }
}
