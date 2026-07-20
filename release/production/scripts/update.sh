#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
./scripts/backup.sh
if [ $# -eq 1 ]; then sed -i.bak "s/^APP_VERSION=.*/APP_VERSION=$1/" .env && rm -f .env.bak; fi
docker compose -f compose.yml --env-file .env pull
docker compose -f compose.yml --env-file .env up -d --wait
./scripts/smoke-test.sh
