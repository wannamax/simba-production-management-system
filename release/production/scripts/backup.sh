#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."; set -a; . ./.env; set +a
mkdir -p backups
FILE="backups/simba-pms-$(date +%Y%m%d-%H%M%S).dump"
docker compose -f compose.yml --env-file .env exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$FILE"
test -s "$FILE" || { rm -f "$FILE"; exit 1; }
echo "$FILE"
