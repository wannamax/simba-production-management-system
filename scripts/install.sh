#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."
./scripts/preflight.sh
# Build tuần tự để tránh nghẽn mạng/RAM trên Docker Desktop
docker compose build web
docker compose build backend
docker compose up -d
docker compose ps
./scripts/smoke-test.sh
echo 'Simba PMS v2.1 đã sẵn sàng tại http://localhost:'"${APP_PORT:-8080}"
