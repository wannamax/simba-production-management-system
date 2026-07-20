#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
URL="http://127.0.0.1:${APP_PORT:-8080}"
i=0
until curl -fsS "$URL/health" >/dev/null && curl -fsS "$URL/api/health" | grep -q '"status":"OK"'; do
  i=$((i+1)); [ "$i" -lt 40 ] || { docker compose -f compose.yml --env-file .env logs --tail=150; exit 1; }; sleep 3
done
echo "Frontend và API hoạt động."
