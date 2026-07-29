import { join } from 'node:path';
import { buildServer } from './server.ts';
import { loadConfig } from './config.ts';
import { openJsonFileStore } from './store/json-file-store.ts';
import { ensureSessionSecret } from './auth/session-secret.ts';
import type { SessionSecretRecord } from './auth/session-secret.ts';
import { ensureBootstrapAdmin } from './auth/bootstrap.ts';
import type { AdminUser } from './auth/users.ts';
import type { SessionRecord } from './auth/session-store-adapter.ts';
import type { Site } from './sites/site.ts';

const config = loadConfig();

const usersStore = openJsonFileStore<AdminUser>(join(config.dataDir, 'users.json'));
const sessionSecretStore = openJsonFileStore<SessionSecretRecord>(join(config.dataDir, 'session-secret.json'));
const sessionRecordStore = openJsonFileStore<SessionRecord>(join(config.dataDir, 'sessions.json'));
const sitesStore = openJsonFileStore<Site>(join(config.dataDir, 'sites.json'));

const sessionSecret = await ensureSessionSecret(sessionSecretStore);
await ensureBootstrapAdmin(usersStore);

const app = await buildServer(config, { usersStore, sessionRecordStore, sessionSecret, sitesStore });

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`admin server listening on port ${config.port}`);
