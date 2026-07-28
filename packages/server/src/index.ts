import { buildServer } from './server.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = await buildServer(config);

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`admin server listening on port ${config.port}`);
