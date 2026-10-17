# Security review (M8)

Review of the system before the pilot, against NFR-06 (encryption, server-side role checks),
NFR-07 (every sign-in and change logged) and CLAUDE.md rules 5 and 8. Date: 2026-10-15.

## What protects what

| Concern | Protection | Where | Tested |
| --- | --- | --- | --- |
| Roles | Every API route checks the role from the database, never from the client. Supervisors are limited to their areas. | `apps/api/src/auth/guard.ts`, each route | yes |
| Event log cannot be changed | PostgreSQL triggers reject UPDATE, DELETE and TRUNCATE on `events` and `payments`; tickets cannot be deleted, reopened or have issue data changed; tariff history cannot be rewritten. | `prisma/migrations/*_immutability` | yes |
| …even if the API is compromised | In production the API connects as a role that does not own the tables, so it cannot disable those triggers, alter, drop or truncate tables. | `prisma/app-role.sql` | yes (`test/db-roles.test.ts`) |
| Agent PIN | Locked after 5 wrong PINs (setting `pinMaxAttempts`), online and offline; only a supervisor reset unlocks it. PINs stored as scrypt hashes (server) and PBKDF2 hashes in the phone's secure store. | `auth/routes.ts`, `apps/agent/src/auth.ts` | yes |
| Console password guessing | Sign-in is rate-limited per IP **and** account (10 per 15 min), so one guesser cannot lock others out and carrier NAT does not block a shift. SMS code: 5 tries, 5 minutes, single use. | `auth/routes.ts` | yes |
| Sessions | Random 256-bit tokens, stored only as SHA-256 hashes; expire (24 h agents, 8 h console); revoked on sign-out, account lock, PIN reset and device block. Console token is in an httpOnly, SameSite=Lax cookie, Secure in production. | `auth/`, `apps/console/lib/session.ts` | yes |
| Lost or stolen phone | Supervisor blocks it: sessions end, sign-in and sync refused. The phone keeps its encrypted unsynced records (docs/DECISIONS.md). | `/devices/:id/block`, console Agentes page | yes |
| Data on the phone | SQLite encrypted with SQLCipher; key in Android Keystore / iOS Keychain (expo-secure-store). | `apps/agent/src/platform.ts` | build config only |
| Data in transit | HTTPS terminated by Caddy in front of API and console (docker-compose.prod.yml). Release Android builds refuse plain HTTP. | deployment | on deployment |
| Browser | Console: `frame-ancestors 'none'`, nosniff, referrer policy; server actions check the origin. API: CORS only for configured origins; `no-store`, nosniff. | `next.config.ts`, `app.ts` | CORS yes |
| Input | Every route input parsed with the shared zod schema; money is integer cents; sync push limited to 200 items. | everywhere | yes |
| Secrets | Nothing secret in the repository; `.env` files are git-ignored; seed admin password ≥ 12 characters from the environment. | `.env.example` | — |
| Camera (plate reading, FR-29) | Only the camera permission (no microphone). The photo is read on the phone and deleted straight away; nothing is uploaded. | `apps/agent/src/components/plate-scanner.tsx` | plate parsing yes |
| Sign-in codes | Sent by WhatsApp through Fonnte (`SMS_PROVIDER=fonnte`). The log stub would expose codes in server logs, so production refuses it unless `ALLOW_SMS_STUB=true` is set deliberately. Send failures answer `SMS_FAILED`. | `src/sms.ts`, `src/server.ts` | yes |

## Dependency audit (`pnpm audit --prod`, 2026-10-15; re-run 2026-10-17, same 7 advisories)

7 advisories, none in code that runs in the API or console at request time:

| Package | Severity | Reached through | Assessment |
| --- | --- | --- | --- |
| mysql2 | high + moderate | Prisma CLI | MySQL driver; this project uses PostgreSQL, never loaded. |
| deepmerge-ts | high | Prisma CLI config | Runs only when migrating, with our own config. |
| node-forge, braces, uuid | high / moderate | Expo CLI, Metro, config plugins | Build and development tooling only. |
| decode-uri-component | moderate | expo-router → query-string (phone app) | Parses the app's own deep links. The fix is a major version its parent does not support. Accepted; recheck at each Expo SDK upgrade. |

Re-run `pnpm audit --prod` before each release.

## Open items

1. **Sign-in codes by WhatsApp (Fonnte).** The Fonnte token can send messages from the AMD WhatsApp number: keep it only in the server environment, rotate it if it leaks. Codes travel through Fonnte and WhatsApp, a third party; acceptable for a one-time 5-minute code.
4. **Console password lockout.** Rate limiting slows guessing; there is no permanent lock after N wrong passwords (unlike agent PINs). Add if AMD wants it.
5. **Tetum texts** are drafts; review so warnings and errors read correctly to agents.
