# Estacionamento Dili

Digital parking tickets for the Autoridade Municipal de Dili (AMD), Timor-Leste: an agent phone app
and a supervisor web console. See [CLAUDE.md](CLAUDE.md) for the rules and [docs/](docs/) for
requirements, design and the build plan.

| Path              | What                                         | Runs on                               |
| ----------------- | -------------------------------------------- | ------------------------------------- |
| `apps/agent`      | Agent phone app (Expo / React Native)        | Expo Go, Android APK or iOS build     |
| `apps/console`    | Supervisor / Finance / Audit / Admin console | http://localhost:3000                 |
| `apps/api`        | REST API and sync service (Fastify)          | http://localhost:3001 (`GET /health`) |
| `packages/shared` | Types, zod schemas, charging rules, i18n     | imported by the other three as source |

## Requirements

- **Node.js 22.12+** (24 LTS recommended — see `.nvmrc`)
- **pnpm 10** — `npm install -g pnpm@10` (or `corepack enable`)
- **Docker Desktop** for PostgreSQL. On Windows it needs WSL 2: run `wsl --install` in an
  administrator terminal and restart.
- For the agent app: the **Expo Go** app on an Android phone or iPhone, or Android Studio with an
  emulator.

## Setup

```sh
pnpm install

# Environment files — edit the values, never commit them
cp .env.example .env
cp .env.example apps/api/.env

# PostgreSQL (also creates the estacionamento_test database on first start)
docker compose up -d

# Database tables, protections and reference data
pnpm --filter @estacionamento/api db:deploy
pnpm --filter @estacionamento/api db:seed

# Start API, console and agent app (Expo) together
pnpm dev
```

Run a single app with a filter, for example `pnpm --filter @estacionamento/api dev`.
To open the agent app on a phone, scan the QR code Expo prints; the phone must be on the same
network, and `EXPO_PUBLIC_API_URL` must use your computer's LAN IP instead of `localhost`.

## Phone builds (Android APK and iOS)

Builds run in the cloud on [EAS Build](https://docs.expo.dev/build/introduction/), so no Mac is
needed for iOS. Run from `apps/agent`:

```sh
pnpm build:apk     # Android APK to install directly on pilot phones
pnpm build:ios     # iOS build for registered test iPhones (internal distribution)
pnpm build:store   # Play Store (.aab) and App Store builds
```

The API address is set in `apps/agent/eas.json` (`EXPO_PUBLIC_API_URL`, currently the pilot
server `https://estacionamento-api.timorstore.com`). Change it there if the server moves; a release
build without it refuses to start.

You need a free Expo account (`npx eas-cli login`). iOS also needs a paid Apple Developer Program
account, and each test iPhone must be registered (`npx eas-cli device:create`) or the build sent
through TestFlight.

## Database

- Schema: [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma). After changing it, run
  `pnpm --filter @estacionamento/api db:migrate` to create a migration.
- The `events` and `payments` tables are append-only, tickets can only go Ativo → Pago, and tariff
  history cannot be rewritten. PostgreSQL triggers enforce this
  ([migration](apps/api/prisma/migrations/20261014020300_immutability/migration.sql)).
- Values AMD has not decided yet (part-hour rule, PIN lockout count, session lengths, serial block
  size) are in the `settings` table, seeded with defaults.
- Console sign-in sends a one-time code by WhatsApp through Fonnte (`SMS_PROVIDER=fonnte`). In
  development (`SMS_PROVIDER=stub`) the code is written to the API log instead.
- API tests that need the database run only when `DATABASE_URL_TEST` is set. Its name must end in
  `_test`, because the test setup wipes it.

## Checks

Run all of these before calling a task done (CI runs the same):

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check   # pnpm format to fix
```
