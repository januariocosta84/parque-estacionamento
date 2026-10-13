import Fastify from 'fastify';
import type { FastifyServerOptions } from 'fastify';
import { healthResponseSchema } from '@estacionamento/shared';
import type { HealthResponse } from '@estacionamento/shared';

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get('/health', async (): Promise<HealthResponse> => {
    return healthResponseSchema.parse({ status: 'ok', time: new Date().toISOString() });
  });

  return app;
}
