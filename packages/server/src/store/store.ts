// The real job of this interface is testability: later groups' route
// tests can use an in-memory fake instead of touching disk. A future
// SQLite-backed implementation is a true but secondary bonus - this
// data (site registry entries, admin user accounts) is small-volume
// and authoritative, unlike the agent's own disposable/rebuildable
// search index, so there is no near-term second implementation to
// design against yet.
export interface Store<T extends { id: string }> {
  list(): Promise<T[]>;
  find(id: string): Promise<T | undefined>;
  save(record: T): Promise<void>;
  delete(id: string): Promise<void>;
}
