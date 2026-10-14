import { afterAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@estacionamento/shared';
import { buildApp } from './app';
import type { Db } from './db';

describe('GET /health', () => {
  // /health does not touch the database.
  const app = buildApp({ db: {} as Db });
  afterAll(() => app.close());

  it('returns ok with a UTC timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body.status).toBe('ok');
    expect(body.time.endsWith('Z')).toBe(true);
  });
});

describe('CORS', () => {
  const app = buildApp({ db: {} as Db, corsOrigins: ['http://localhost:3000'] });
  afterAll(() => app.close());

  const preflight = (origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url: '/tickets',
      headers: { origin, 'access-control-request-method': 'GET' },
    });

  it('allows a configured origin', async () => {
    const res = await preflight('http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not allow any other origin', async () => {
    const res = await preflight('http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows no origin when none is configured', async () => {
    const closed = buildApp({ db: {} as Db });
    const res = await closed.inject({
      method: 'OPTIONS',
      url: '/tickets',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await closed.close();
  });
});
