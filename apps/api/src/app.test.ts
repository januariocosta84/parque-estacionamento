import { afterAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@estacionamento/shared';
import { buildApp } from './app';

describe('GET /health', () => {
  const app = buildApp();
  afterAll(() => app.close());

  it('returns ok with a UTC timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body.status).toBe('ok');
    expect(body.time.endsWith('Z')).toBe(true);
  });
});
