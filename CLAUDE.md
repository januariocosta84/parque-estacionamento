# Estacionamento Dili

Digital parking tickets for the Autoridade Municipal de Dili (AMD), Timor-Leste.
Replaces the handwritten paper _Título de Estacionamento_ (Decreto-Lei n.º 3/2017)
with an agent phone app and a supervisor web console.

Read before working:

- `docs/REQUIREMENTS.md` — what the system must do (FR-xx, BR-xx, NFR-xx IDs)
- `docs/DESIGN.md` — colours, fonts, components, screen list
- `docs/screens/` — the approved screen designs (PNG). Match them.
- `docs/PLAN.md` — milestones; work on one milestone at a time

## Stack

Monorepo with pnpm workspaces + Turborepo, TypeScript everywhere (strict mode).

| Path              | What                                                            | Tech                                                             |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/agent`      | Agent phone app (Android first)                                 | Expo (React Native), expo-router, expo-sqlite, expo-secure-store |
| `apps/console`    | Supervisor / Finance / Audit / Admin web console                | Next.js (App Router), Tailwind CSS                               |
| `apps/api`        | REST API and sync service                                       | Node.js, Fastify, Prisma, PostgreSQL                             |
| `packages/shared` | Types, zod schemas, charging rules, serial format, i18n strings | TypeScript                                                       |

Local development: `docker compose up -d` (PostgreSQL), then `pnpm dev`.

## Rules that must never be broken

1. **Money is integer US-dollar cents.** Never floats. `50` = US$ 0.50.
2. **Charging lives in one place:** `packages/shared/src/charging.ts`, used by app, API and console.
   Minimum 1 hour; each started hour counts as a full hour (BR-02, BR-03). Tariff applied is the one
   in force when the ticket was issued (BR-04). Full unit tests required.
3. **Times come from the system clock**, never typed by the agent (BR-09). Store UTC; display Asia/Dili (UTC+9).
4. **Tickets go Ativo → Pago only.** No reopening, no deleting (BR-05–07). Corrections are new events.
5. **Event log is append-only.** Every action writes an `Event`. Enforce in PostgreSQL with a trigger
   that rejects UPDATE and DELETE on `events`, not only in application code (FR-26, NFR-07).
6. **Offline first (NFR-01).** The agent app writes to local SQLite first and syncs through an outbox.
   Sync must be idempotent: every ticket and event has a client-generated UUID; the server ignores duplicates.
7. **Serial numbers work offline (FR-08).** The server allocates each device a block of serial numbers
   in advance (e.g. 50). Format: `NNNNNNN/MAE/A.M.DILI`, starting after 2538667.
8. **Roles are checked on the server** for every request: agent, supervisor, finance, auditor, admin.
9. **All user-facing text through i18n** (`pt` and `tet`). Portuguese is the default. No hard-coded strings in screens.
10. Never commit secrets. Use `.env` files listed in `.env.example`.

## Conventions

- Plates stored upper case as written: `A-2847-TL`.
- Domain words in code stay in English (`ticket`, `exit`, `payment`); UI copy is Portuguese/Tetum.
- Every API route has a zod schema in `packages/shared` and an integration test.
- Run `pnpm lint && pnpm typecheck && pnpm test` before saying a task is done.
- Small commits, one feature each, message in English.

## Open decisions (do not invent values)

Car and heavy-vehicle tariffs, part-hour rule, vehicle classes, SMS provider and record retention are
not decided yet. Keep them configurable (tariffs and classes in the database, seeded with
Motorizadas = 50 cents/hour and placeholders for the others). Ask before hard-coding anything here.
