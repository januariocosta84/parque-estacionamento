import { buildApp } from './app';
import { createDb } from './db';
import { FonnteSender } from './sms';
import type { SmsSender } from './sms';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL ?? fail('DATABASE_URL is not set (see .env.example)');
const production = process.env.NODE_ENV === 'production';

// Console sign-in codes (FR-04): Fonnte (WhatsApp) in production, or the log stub in development.
// The stub writes codes to the server log, so production only accepts it when allowed on purpose.
const smsProvider = process.env.SMS_PROVIDER ?? 'stub';
let sms: SmsSender | undefined;
if (smsProvider === 'fonnte') {
  const token = process.env.FONNTE_TOKEN ?? fail('SMS_PROVIDER=fonnte needs FONNTE_TOKEN');
  sms = new FonnteSender(token, process.env.FONNTE_COUNTRY_CODE ?? '670');
} else if (smsProvider !== 'stub') {
  fail(`Unknown SMS_PROVIDER "${smsProvider}" (use fonnte or stub)`);
} else if (production && process.env.ALLOW_SMS_STUB !== 'true') {
  fail(
    'SMS_PROVIDER is the log stub. Set SMS_PROVIDER=fonnte with FONNTE_TOKEN, or ALLOW_SMS_STUB=true to accept that sign-in codes are written to the server log.',
  );
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
  { db, corsOrigins, ...(sms ? { sms } : {}) },
  {
    logger: true,
    // Behind the reverse proxy in production, so rate limits see the real client IP.
    trustProxy: process.env.TRUST_PROXY === 'true',
  },
);
app.addHook('onClose', () => db.$disconnect());

try {
  await app.listen({ host, port });
  app.log.info({ smsProvider }, 'sign-in codes are sent with this provider');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
