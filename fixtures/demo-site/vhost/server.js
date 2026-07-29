import { startServer } from '@oa/cms-agent';
import { join } from 'node:path';

await startServer(join(import.meta.dirname, '..'));
