#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v docker >/dev/null 2>&1 || { echo "Chưa cài Docker."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker chưa chạy."; exit 1; }
[ -f .env ] || cp .env.example .env
if ! grep -Eq '^POSTGRES_PASSWORD=.{16,}$' .env; then
  PASS=$(openssl rand -hex 24 2>/dev/null || date +%s%N | shasum -a 256 | cut -c1-48)
  awk -v p="$PASS" 'BEGIN{done=0} /^POSTGRES_PASSWORD=/{print "POSTGRES_PASSWORD=" p;done=1;next} {print} END{if(!done)print "POSTGRES_PASSWORD=" p}' .env > .env.tmp && mv .env.tmp .env
fi
set -a; . ./.env; set +a
if [ -n "${GHCR_TOKEN:-}" ] && [ -n "${GHCR_USERNAME:-}" ]; then echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin; fi
docker compose -f compose.yml --env-file .env pull
docker compose -f compose.yml --env-file .env up -d --wait
./scripts/smoke-test.sh
echo "Hoàn tất: http://localhost:${APP_PORT:-8080}"
