import type { Store } from '../store/store.ts';
import type { AdminUser } from '../auth/users.ts';
import type { Site } from './site.ts';

// Assigns every pre-existing, ownerless site to the earliest-created
// developer account - safe, not a guess under real ambiguity: every
// deployment that could have an ownerless site on disk necessarily has
// no multi-user support running yet (this is the migration that
// introduces it), so there has only ever been one account possible in
// practice. Must run after ensureBootstrapAdmin (index.ts), which
// backfills role onto pre-existing users - this needs role already
// populated to find "the earliest developer" at all.
export async function backfillSiteOwnership(usersStore: Store<AdminUser>, sitesStore: Store<Site>): Promise<void> {
  const ownerless = (await sitesStore.list()).filter((site) => !site.ownerId);
  if (ownerless.length === 0) {
    return;
  }

  const developers = (await usersStore.list())
    .filter((user) => user.role === 'developer')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const earliest = developers[0];
  if (!earliest) {
    // Unreachable in practice - POST /v1/sites has always required
    // requireAuth, so any deployment with a Site on disk already has
    // at least one AdminUser. Guarded explicitly anyway, matching this
    // codebase's own "never leave an invalid record on disk" principle
    // literally: a silent ownerId: undefined write would be worse than
    // a loud failure here.
    throw new Error('Cannot backfill site ownership: no developer account exists');
  }

  for (const site of ownerless) {
    await sitesStore.save({ ...site, ownerId: earliest.id });
  }
}
