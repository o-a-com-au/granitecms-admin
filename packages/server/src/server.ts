import Fastify, { type FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health.ts';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify();

  await app.register(healthRoutes, { prefix: '/api' });

  return app;
}
