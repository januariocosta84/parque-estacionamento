// Proves the production app role (prisma/app-role.sql) can work with rows but cannot switch off
// the append-only protections, which only a table owner could do (CLAUDE.md rule 5).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { hasTestDb, seedTestDb, testDb, testDbUrl } from './helpers';

const APP_ROLE = 'estacionamento_app_probe';
const APP_PASSWORD = 'probe-only-password';

describe.skipIf(!hasTestDb)('production database role', () => {
  let app: pg.Client;

  beforeAll(async () => {
    const db = testDb();
    await seedTestDb(db); // make sure every table exists and has rows
    await db.$disconnect();

    const url = new URL(testDbUrl!);
    const sql = readFileSync(new URL('../prisma/app-role.sql', import.meta.url), 'utf8')
      .replaceAll('{{APP_ROLE}}', APP_ROLE)
      .replaceAll('{{APP_PASSWORD}}', APP_PASSWORD)
      .replaceAll('{{OWNER_ROLE}}', decodeURIComponent(url.username))
      .replaceAll('{{DATABASE}}', url.pathname.slice(1));
    const owner = new pg.Client({ connectionString: testDbUrl });
    await owner.connect();
    await owner.query(sql);
    await owner.end();

    url.username = APP_ROLE;
    url.password = APP_PASSWORD;
    app = new pg.Client({ connectionString: url.toString() });
    await app.connect();
  });
  afterAll(() => app?.end());

  it('can read and write ordinary rows', async () => {
    const { rows } = await app.query('SELECT count(*)::int AS n FROM areas');
    expect(rows[0].n).toBeGreaterThan(0);
    await expect(
      app.query("UPDATE settings SET value = value WHERE key = 'pinMaxAttempts'"),
    ).resolves.toBeTruthy();
  });

  it('cannot disable the append-only triggers or change tables', async () => {
    await expect(app.query('ALTER TABLE events DISABLE TRIGGER ALL')).rejects.toThrow(
      /must be owner/,
    );
    await expect(
      app.query('ALTER TABLE tickets DISABLE TRIGGER tickets_guard_update'),
    ).rejects.toThrow(/must be owner/);
    await expect(app.query('DROP TABLE events')).rejects.toThrow(/must be owner/);
  });

  it('cannot truncate, and the triggers still refuse UPDATE and DELETE on events', async () => {
    // Writing events is allowed (that is the API's job), so there is at least one row to protect.
    const { rows } = await app.query("SELECT id FROM users WHERE username = 'admin'");
    await app.query(
      "INSERT INTO events (id, type, at, user_id, details) VALUES (gen_random_uuid(), 'SIGN_IN', now(), $1, '{}')",
      [rows[0].id],
    );
    await expect(app.query('TRUNCATE events')).rejects.toThrow(/permission denied/);
    await expect(app.query("UPDATE events SET details = '{}'")).rejects.toThrow(/append-only/);
    await expect(app.query('DELETE FROM events')).rejects.toThrow(/append-only/);
  });

  it('cannot touch the migration history', async () => {
    await expect(app.query('SELECT * FROM _prisma_migrations')).rejects.toThrow(
      /permission denied/,
    );
  });
});
