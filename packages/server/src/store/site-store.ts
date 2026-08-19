import type { Site } from '../sites/site.ts';
import type { Store } from './store.ts';
import { openInMemoryStore } from './in-memory-store.ts';

// "My sites" - the list-my-sites path (routes/sites.ts's GET /),
// filtered by ownerId today via list()+filter(). Hit on nearly every
// page load, so the one lookup most worth indexing first.
export interface SiteStore extends Store<Site> {
  listByOwner(ownerId: string): Promise<Site[]>;
}

export function openInMemorySiteStore(): SiteStore {
  const base = openInMemoryStore<Site>();
  return {
    ...base,
    async listByOwner(ownerId) {
      const sites = await base.list();
      return sites.filter((site) => site.ownerId === ownerId);
    },
  };
}
