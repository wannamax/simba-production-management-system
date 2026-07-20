#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-release/production/compose.yml}"
BASE_URL="${BASE_URL:-http://localhost:8080}"

echo "== Simba PMS local UAT =="
docker compose -f "$COMPOSE_FILE" ps
curl -fsS "$BASE_URL/health" >/dev/null
curl -fsS "$BASE_URL/api/health" >/dev/null
for endpoint in customers employees projects tasks dashboard/summary; do
  curl -fsS "$BASE_URL/api/$endpoint" >/dev/null
  echo "OK /api/$endpoint"
done
curl -fsS -o /tmp/simba-customers-template.xlsx "$BASE_URL/api/data-transfer/customers/template"
test -s /tmp/simba-customers-template.xlsx
echo "OK template Excel"
echo "UAT kỹ thuật đạt. CRUD giao diện vẫn cần người dùng xác nhận theo docs/UAT_2.2.1_VI.md."
