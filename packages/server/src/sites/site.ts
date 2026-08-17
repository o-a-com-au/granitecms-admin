export interface Site {
  id: string;
  url: string;
  token: string;
  // The developer AdminUser who registered this site - implicit full
  // access for them, never a SiteAccess row (site-access.ts covers only
  // client grants). Backfilled onto pre-existing sites by
  // site-ownership-backfill.ts on upgrade.
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}
