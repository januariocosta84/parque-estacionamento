# Build plan — fast track

Release 1 in use by week 10. Work one milestone at a time; each ends with passing lint, typecheck and tests.

- [x] **M0 — Scaffold** (day 1): pnpm + Turborepo monorepo, `apps/agent`, `apps/console`, `apps/api`, `packages/shared`, docker compose PostgreSQL, ESLint, Prettier, Vitest, CI workflow.
- [x] **M1 — Domain core** (`packages/shared`): types and zod schemas for all records; `charging.ts` (BR-01–04) with full tests; serial number format and block allocation helpers; i18n strings `pt` and `tet`.
- [ ] **M2 — Database and API base**: Prisma schema (see REQUIREMENTS Data), migrations, append-only trigger on `events`, seed (areas Setor A–C, vehicle classes, Motorizadas 50 c/h, admin user), auth (agent PIN, console password + SMS-code stub), role guard.
- [ ] **M3 — Ticket API**: issue, exit (calculate), payment + receipt, list/search; every action writes an Event; integration tests.
- [ ] **M4 — Sync API**: device registration, serial block allocation, idempotent batch upload (outbox), pull changes since cursor; tests for duplicates and out-of-order uploads.
- [ ] **M5 — Agent app, offline core**: SQLite schema, outbox, background sync, sign-in with offline cache, PIN lockout.
- [ ] **M6 — Agent app screens**: Início, Novo título, Título emitido, Registar saída, Pagamento recebido, Histórico — matching `docs/screens`.
- [ ] **M7 — Console**: sign-in, Monitorização (live totals, filters, active tickets, recent activity), daily revenue report, audit log view, admin (users, areas, classes, tariffs).
- [ ] **M8 — Hardening for pilot**: end-to-end test of the full ticket flow offline → online, security review, Android build (APK) for pilot phones, deployment of API + console, backups.

Release 2 (after pilot): FR-09 duplicate-plate warning, FR-11 SMS, FR-12 Bluetooth printer, FR-22 hourly chart, FR-24 alerts, FR-27 exports.
