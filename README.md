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

# PostgreSQL
docker compose up -d

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

You need a free Expo account (`npx eas-cli login`). iOS also needs a paid Apple Developer Program
account, and each test iPhone must be registered (`npx eas-cli device:create`) or the build sent
through TestFlight.

## Checks

Run all of these before calling a task done (CI runs the same):

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check   # pnpm format to fix
```
