import { resolve } from 'node:path';

export interface AdminConfig {
  port: number;
  dataDir: string;
  webDistDir: string;
}

// packages/server/src/config.ts (dev, run directly) and
// packages/server/dist/config.js (built) both sit exactly two
// directories under packages/, so '../../web/dist' resolves correctly
// from either location. Resolved from this module's own location,
// not process.cwd(): the built web assets are a fixed sibling of this
// package, not something that varies by deployment the way the data
// directory does (which stays CWD/env-relative, since it genuinely is
// operator configuration).
const DEFAULT_WEB_DIST_DIR = resolve(import.meta.dirname, '../../web/dist');

export function loadConfig(): AdminConfig {
  const port = Number(process.env.PORT ?? 4278);
  const dataDir = resolve(process.env.ADMIN_DATA_DIR ?? 'data');
  const webDistDir = resolve(process.env.ADMIN_WEB_DIST ?? DEFAULT_WEB_DIST_DIR);
  return { port, dataDir, webDistDir };
}
