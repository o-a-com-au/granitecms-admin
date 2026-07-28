import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { healthRoutes } from './routes/health.ts';
import { loadConfig, type AdminConfig } from './config.ts';

export async function buildServer(config: AdminConfig = loadConfig()): Promise<FastifyInstance> {
  const app = Fastify();

  await app.register(healthRoutes, { prefix: '/api' });

  // Skipped when the web package hasn't been built yet (e.g. running
  // the backend's own tests, or `npm run dev`, where Vite serves the
  // frontend instead) - only the real production boot needs this.
  if (existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api')) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      // SPA client-side routing fallback: any non-API path that isn't
      // a real static file gets the app shell, which handles routing
      // itself.
      reply.sendFile('index.html', config.webDistDir);
    });
  }

  return app;
}
