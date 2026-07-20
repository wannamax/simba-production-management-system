#!/usr/bin/env sh
set -eu
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
DB=${POSTGRES_DB:-production_management}
USER=${POSTGRES_USER:-pms_app}
docker compose exec -T db pg_dump -U "$USER" -d "$DB" -Fc > "backups/pms-$STAMP.dump"
echo "Backup: backups/pms-$STAMP.dump"
