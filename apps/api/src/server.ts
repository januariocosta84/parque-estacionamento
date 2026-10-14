import { buildApp } from './app';
import { createDb } from './db';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set (see .env.example)');
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
const app = buildApp({ db, corsOrigins }, { logger: true });
app.addHook('onClose', () => db.$disconnect());

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
