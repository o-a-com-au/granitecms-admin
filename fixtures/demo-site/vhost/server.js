import { startServer } from '@o-a/cms-agent';
import { join } from 'node:path';

await startServer(join(import.meta.dirname, '..'));
