# Deployment (pilot)

One Linux server runs everything with Docker Compose (`docker-compose.prod.yml`):

| Service | What | Reachable |
| --- | --- | --- |
| caddy | HTTPS for both sites, certificates renewed automatically | ports 80, 443 |
| console | Supervisor / finance / audit / admin web console | via Caddy |
| api | REST API and phone sync | via Caddy |
| postgres | Database | internal only |
| migrate | Runs on each deploy: migrations, restricted app role, reference data; then exits | — |
| backup | `pg_dump` once a day into `./backups` | — |

## 1. Before you start

- A Linux server (2 CPU, 4 GB RAM, 40 GB disk is plenty for the pilot) with Docker Engine and the
  Compose plugin, ports 80 and 443 open to the internet.
- Two DNS names pointing at the server, e.g. `api.<domain>` and `consola.<domain>`.
- Decisions still open (CLAUDE.md): **SMS provider** (until then console codes go to the API log,
  see docs/SECURITY.md) and **record retention**.

## 2. First deploy

```sh
git clone <repository> estacionamento && cd estacionamento
cp .env.production.example .env.production
nano .env.production            # fill in every value; long random passwords
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production logs migrate   # must end with "Seed complete"
```

Then open `https://<CONSOLE_DOMAIN>` and sign in as the admin from `.env.production`. With the SMS
stub the code is in the API log:

```sh
docker compose -f docker-compose.prod.yml --env-file .env.production logs api | grep "SMS stub" | tail -1
```

In **Administração**: give the admin a phone number, create supervisors and agents, check Setor
A–C and the Motorizadas tariff. Car and heavy-vehicle tariffs stay off until AMD decides them.

## 3. Phones

Build the app with `EXPO_PUBLIC_API_URL=https://<API_DOMAIN>` (README "Phone builds") and install it.
Each agent signs in once **with signal**: that downloads tariffs and serial numbers and enables
offline sign-in.

## 4. Updates

```sh
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`migrate` runs first; the API starts only if it succeeds. Migrations never delete data.

## 5. Backups (NFR-09)

- `backup` writes `./backups/estacionamento-<UTC time>.dump` every 24 hours and deletes dumps older
  than `BACKUP_KEEP_DAYS`. Check it: `ls -lh backups/`.
- **Copy `./backups` off the server every day** (another machine, encrypted disk or storage).
  A backup on the same disk does not survive a disk failure.
- The dumps contain every ticket, payment and account: keep them where only administrators can read
  them.

## 6. Restore (target: within one working day)

```sh
# 1. Stop everything that writes
docker compose -f docker-compose.prod.yml --env-file .env.production stop api console backup
# 2. Restore the chosen dump into a fresh database
docker compose -f docker-compose.prod.yml --env-file .env.production exec postgres \
  sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < backups/estacionamento-<time>.dump
# 3. Start again (migrate re-creates the app role and its grants)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

What a restore loses: everything the server received **after** the dump was taken (up to 24 hours
with one backup a day). Phones send anything still waiting in their outbox after the restore, but
tickets they had already synced are not sent again: they stay visible on the phones that handled them
and are missing from the server. If losing up to a day is too much for AMD, take backups more often
(lower the `sleep` in docker/backup.sh) or add continuous WAL archiving.

**Before the pilot starts, do a restore drill** on a second server or a copy: restore last night's
dump, sign in to the console, compare the day's totals with the live system, and note how long it
took.

## 7. Health and logs

- `https://<API_DOMAIN>/health` → `{"status":"ok", …}`
- `docker compose -f docker-compose.prod.yml --env-file .env.production ps` — all services `running`
  (`migrate` `exited (0)`).
- Logs: `docker compose … logs -f api` (JSON, one line per request).
