import { resolve } from 'node:path';

export interface AdminConfig {
  port: number;
  dataDir: string;
  webDistDir: string;
}

export function loadConfig(): AdminConfig {
  const port = Number(process.env.PORT ?? 4278);
  const dataDir = resolve(process.env.ADMIN_DATA_DIR ?? 'data');
  const webDistDir = resolve(process.env.ADMIN_WEB_DIST ?? '../web/dist');
  return { port, dataDir, webDistDir };
}
