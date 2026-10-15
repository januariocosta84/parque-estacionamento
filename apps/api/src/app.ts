import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
  // Off by default; sign-in routes opt in (auth/routes.ts).
  void app.register(rateLimit, { global: false });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('cache-control', 'no-store');
    reply.header('referrer-policy', 'no-referrer');
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ApiError) return sendError(reply, err);
    if ((err as { code?: string }).code === 'P2002') {
      return sendError(reply, new ApiError('CONFLICT', 'Already exists'));
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) {
      return sendError(reply, new ApiError('RATE_LIMITED', 'Too many attempts; try again later'));
    }
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

  // Inside a plugin so the rate-limit plugin above is loaded before the routes are added.
  void app.register(async (routes) => {
    registerAuthRoutes(routes, deps.db, sms);
    registerTicketRoutes(routes, deps.db);
    registerSyncRoutes(routes, deps.db);
    registerConsoleRoutes(routes, deps.db);
    registerAdminRoutes(routes, deps.db);
  });

  return app;
}
