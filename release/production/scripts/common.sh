#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f compose.yml --env-file .env"
