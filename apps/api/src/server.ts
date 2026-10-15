import { buildApp } from './app';
import { createDb } from './db';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set (see .env.example)');
  process.exit(1);
}

// No SMS provider is chosen yet (CLAUDE.md "Open decisions"); the stub writes console sign-in
// codes to the server log. In production that must be a deliberate choice, never a default.
const production = process.env.NODE_ENV === 'production';
if (
  production &&
  (process.env.SMS_PROVIDER ?? 'stub') === 'stub' &&
  process.env.ALLOW_SMS_STUB !== 'true'
) {
  console.error(
    'SMS_PROVIDER is the log stub. Configure an SMS provider, or set ALLOW_SMS_STUB=true to accept that sign-in codes are written to the server log.',
  );
  process.exit(1);
}

const host = process.env.API_HOST ?? '0.0.0.0';
const port = Number(process.env.API_PORT ?? 3001);

// Comma-separated browser origins allowed to call the API, e.g. the console's URL.
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const db = createDb(databaseUrl);
const app = buildApp(
  { db, corsOrigins },
  {
    logger: true,
    // Behind the reverse proxy in production, so rate limits see the real client IP.
    trustProxy: process.env.TRUST_PROXY === 'true',
  },
);
app.addHook('onClose', () => db.$disconnect());

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
