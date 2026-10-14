// Recreates the test database schema and applies all migrations before the test run.
// Runs only against a database whose name ends in "_test", so it can never touch real data.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.warn(
      '\n⚠ DATABASE_URL_TEST is not set: database integration tests are SKIPPED. CI always runs them.\n',
    );
    return;
  }

  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": DATABASE_URL_TEST must name a *_test database`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // Dropping the schema removes the append-only tables wholesale; that is fine for a test DB.
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  } finally {
    await client.end();
  }

  const apiDir = fileURLToPath(new URL('..', import.meta.url));
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
