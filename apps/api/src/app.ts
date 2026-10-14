import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyServerOptions } from 'fastify';
import { healthResponseSchema } from '@estacionamento/shared';
import type { ErrorResponse, HealthResponse } from '@estacionamento/shared';
import { registerAdminRoutes } from './admin/routes';
import { registerAuthRoutes } from './auth/routes';
import { registerConsoleRoutes } from './console/routes';
import type { Db } from './db';
import { ApiError, sendError } from './http';
import { LogSmsSender } from './sms';
import type { SmsSender } from './sms';
import { registerSyncRoutes } from './sync/routes';
import { registerTicketRoutes } from './tickets/routes';

export interface AppDeps {
  db: Db;
  sms?: SmsSender;
  /** Browser origins allowed to call the API (the console). None by default. */
  corsOrigins?: string[];
}

export function buildApp(deps: AppDeps, options: FastifyServerOptions = {}) {
  const app = Fastify(options);
  const sms = deps.sms ?? new LogSmsSender(app.log);

  void app.register(cors, {
    origin: deps.corsOrigins ?? false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) return sendError(reply, err);
    if ((err as { code?: string }).code === 'P2002') {
      return sendError(reply, new ApiError('CONFLICT', 'Already exists'));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return sendError(reply, new ApiError('BAD_REQUEST', (err as Error).message));
    }
    request.log.error(err);
    const body: ErrorResponse = { error: 'INTERNAL', message: 'Unexpected error' };
    return reply.status(500).send(body);
  });

  app.get('/health', async (): Promise<HealthResponse> => {
    return healthResponseSchema.parse({ status: 'ok', time: new Date().toISOString() });
  });

  registerAuthRoutes(app, deps.db, sms);
  registerTicketRoutes(app, deps.db);
  registerSyncRoutes(app, deps.db);
  registerConsoleRoutes(app, deps.db);
  registerAdminRoutes(app, deps.db);

  return app;
}
