#!/bin/sh
# Daily database backup (NFR-09). Runs in the `backup` service of docker-compose.prod.yml.
# Custom-format dumps restore with pg_restore (docs/DEPLOY.md "Restore").
set -eu

: "${BACKUP_KEEP_DAYS:?set BACKUP_KEEP_DAYS}"
mkdir -p /backups

while true; do
  stamp=$(date -u +%Y%m%d-%H%M%S)
  file="/backups/estacionamento-$stamp.dump"
  if pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="$file.partial"; then
    mv "$file.partial" "$file"
    echo "backup ok: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    echo "BACKUP FAILED at $stamp" >&2
  fi
  find /backups -name 'estacionamento-*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
  sleep 86400
done
