// Creates or updates the restricted role the API runs as (prisma/app-role.sql).
// Run as the table owner, after `prisma migrate deploy`. Used by the migrate job in production.
import { readFileSync } from 'node:fs';
import pg from 'pg';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.production.example)`);
  return value;
}

const ownerUrl = new URL(required('DATABASE_URL'));
const appRole = required('APP_DB_USER');
const appPassword = required('APP_DB_PASSWORD');
if (!/^[a-z_][a-z0-9_]*$/.test(appRole))
  throw new Error('APP_DB_USER: lower-case letters, digits and _ only');
if (appPassword.includes("'")) throw new Error('APP_DB_PASSWORD must not contain a quote');

const sql = readFileSync(new URL('../prisma/app-role.sql', import.meta.url), 'utf8')
  .replaceAll('{{APP_ROLE}}', appRole)
  .replaceAll('{{APP_PASSWORD}}', appPassword)
  .replaceAll('{{OWNER_ROLE}}', decodeURIComponent(ownerUrl.username))
  .replaceAll('{{DATABASE}}', ownerUrl.pathname.slice(1));

const client = new pg.Client({ connectionString: ownerUrl.toString() });
await client.connect();
try {
  await client.query(sql);
  // Keep the password in step with the environment on every deploy.
  await client.query(`ALTER ROLE "${appRole}" WITH LOGIN PASSWORD '${appPassword}'`);
  console.warn(`App role "${appRole}" is ready`);
} finally {
  await client.end();
}
