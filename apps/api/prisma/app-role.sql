-- The role the API connects as in production (CLAUDE.md rule 5, NFR-06).
--
-- Migrations run as the table OWNER ({{OWNER_ROLE}}). The API runs as {{APP_ROLE}}, which can
-- read and write rows but does not own the tables, so it cannot DISABLE the append-only
-- triggers, ALTER or DROP tables, or TRUNCATE. The triggers then hold even if the API is
-- compromised.
--
-- Placeholders are replaced before running (docker/postgres/10-app-role.sh, test/db-roles.test.ts).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{{APP_ROLE}}') THEN
    CREATE ROLE "{{APP_ROLE}}" LOGIN PASSWORD '{{APP_PASSWORD}}';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE "{{DATABASE}}" TO "{{APP_ROLE}}";
GRANT USAGE ON SCHEMA public TO "{{APP_ROLE}}";

-- Tables that already exist…
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "{{APP_ROLE}}";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "{{APP_ROLE}}";

-- …and tables created by future migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE "{{OWNER_ROLE}}" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "{{APP_ROLE}}";
ALTER DEFAULT PRIVILEGES FOR ROLE "{{OWNER_ROLE}}" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO "{{APP_ROLE}}";

-- Prisma's migration history is the owner's business only.
REVOKE ALL ON TABLE _prisma_migrations FROM "{{APP_ROLE}}";
