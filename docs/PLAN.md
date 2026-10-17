# Build plan — fast track

Release 1 in use by week 10. Work one milestone at a time; each ends with passing lint, typecheck and tests.

- [x] **M0 — Scaffold** (day 1): pnpm + Turborepo monorepo, `apps/agent`, `apps/console`, `apps/api`, `packages/shared`, docker compose PostgreSQL, ESLint, Prettier, Vitest, CI workflow.
- [x] **M1 — Domain core** (`packages/shared`): types and zod schemas for all records; `charging.ts` (BR-01–04) with full tests; serial number format and block allocation helpers; i18n strings `pt` and `tet`.
- [x] **M2 — Database and API base**: Prisma schema (see REQUIREMENTS Data), migrations, append-only trigger on `events`, seed (areas Setor A–C, vehicle classes, Motorizadas 50 c/h, admin user), auth (agent PIN, console password + SMS-code stub), role guard.
- [x] **M3 — Ticket API**: issue, exit (calculate), payment + receipt, list/search; every action writes an Event; integration tests.
- [x] **M4 — Sync API**: device registration, serial block allocation, idempotent batch upload (outbox), pull changes since cursor; tests for duplicates and out-of-order uploads.
- [x] **M5 — Agent app, offline core**: SQLite schema, outbox, background sync, sign-in with offline cache, PIN lockout.
- [x] **M6 — Agent app screens**: Início, Novo título, Título emitido, Registar saída, Pagamento recebido, Histórico — matching `docs/screens`.
- [x] **M7 — Console**: sign-in, Monitorização (live totals, filters, active tickets, recent activity), daily revenue report, audit log view, admin (users, areas, classes, tariffs).
- [ ] **M8 — Hardening for pilot**: end-to-end test of the full ticket flow offline → online, security review, Android build (APK) and iOS build (EAS, internal distribution / TestFlight) for pilot phones, tested on a real device of each, deployment of API + console, backups.
  - [x] End-to-end test offline → online (`apps/agent/test/e2e.test.ts`, runs in CI)
  - [x] Security review (docs/SECURITY.md; dependency audit re-run 2026-10-17, unchanged)
  - [x] API + console deployed to the pilot VPS (docs/DEPLOY.md), daily backups
  - [x] Android APK built on EAS from the current code (preview profile, 2026-10-16)
  - [ ] APK tested on a real Android phone: sign in with signal, issue / exit / pay offline, sync when signal returns, plate camera (FR-29)
  - [ ] iOS build (needs Apple Developer account; register test iPhones or use TestFlight) and tested on a real iPhone
  - [ ] Backups copied off the server daily; restore drill done and timed (docs/DEPLOY.md §6)

Release 2 (after pilot): FR-09 duplicate-plate warning, FR-11 SMS, FR-12 Bluetooth printer, FR-22 hourly chart, FR-24 alerts, FR-27 exports.
