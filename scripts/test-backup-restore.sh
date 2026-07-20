#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
./scripts/backup.sh
LATEST=$(ls -t backups/*.dump | head -1)
docker compose exec -T db psql -U "${POSTGRES_USER:-pms_app}" -d "${POSTGRES_DB:-production_management}" -c "CREATE TABLE IF NOT EXISTS restore_probe(id int primary key); INSERT INTO restore_probe VALUES(1) ON CONFLICT DO NOTHING;" >/dev/null
./scripts/restore.sh "$LATEST"
docker compose exec -T db psql -U "${POSTGRES_USER:-pms_app}" -d "${POSTGRES_DB:-production_management}" -tAc "SELECT version FROM schema_migrations WHERE version='2.1.0'" | grep -q 2.1.0
echo 'Backup/restore test OK.'
