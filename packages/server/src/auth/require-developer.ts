import type { FastifyRequest } from 'fastify';
import { ForbiddenRoleError } from './forbidden-role-error.ts';

// Composed after requireAuth (which populates request.currentUser) in
// every route that gates on role rather than a specific resource:
// registering a site, and every route in routes/site-users.ts (invite/
// list/revoke client access) - a client with legitimate content access
// to a site would otherwise also pass a bare site-access check on that
// same site, so this gate is load-bearing, not implied by anything else.
export function createRequireDeveloper() {
  return async function requireDeveloper(request: FastifyRequest): Promise<void> {
    if (request.currentUser?.role !== 'developer') {
      throw new ForbiddenRoleError('This action is restricted to developer accounts');
    }
  };
}
