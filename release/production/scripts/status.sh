#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
docker compose -f compose.yml --env-file .env ps
docker compose -f compose.yml --env-file .env logs --tail=80
