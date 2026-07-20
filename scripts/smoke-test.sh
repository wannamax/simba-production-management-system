#!/usr/bin/env bash
set -Eeuo pipefail
PORT=${APP_PORT:-$(grep '^APP_PORT=' .env 2>/dev/null | cut -d= -f2)}; PORT=${PORT:-8080}
BASE="http://127.0.0.1:$PORT"
for i in $(seq 1 60); do curl -fsS "$BASE/health" >/tmp/pms-health.json && break; sleep 2; done
curl -fsS "$BASE/health" | grep -q 'connected'
curl -fsS "$BASE/api/projects?limit=1" | grep -q 'success'
curl -fsS "$BASE/" | grep -qi '<!doctype html'
echo 'Smoke test OK: frontend + API + database.'
