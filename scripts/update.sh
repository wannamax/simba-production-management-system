#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/backup.sh
docker compose pull || true
docker compose up -d --build --remove-orphans
docker image prune -f
docker compose ps
