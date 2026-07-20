#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-release/production/compose.yml}"
MARKER="PERSISTENCE-$(date +%s)"
DB_USER="${POSTGRES_USER:-pms_app}"
DB_NAME="${POSTGRES_DB:-production_management}"

docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "INSERT INTO system_settings(setting_key,setting_value,setting_type,description) VALUES ('$MARKER','ok','test','persistence test');"
docker compose -f "$COMPOSE_FILE" down
docker compose -f "$COMPOSE_FILE" up -d --wait
COUNT=$(docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$DB_USER" -d "$DB_NAME" -Atc "SELECT count(*) FROM system_settings WHERE setting_key='$MARKER';")
[ "$COUNT" = "1" ] || { echo "Persistence FAILED"; exit 1; }
docker compose -f "$COMPOSE_FILE" exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c "DELETE FROM system_settings WHERE setting_key='$MARKER';" >/dev/null
echo "Persistence PASSED"
