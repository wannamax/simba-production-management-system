#!/usr/bin/env bash
set -Eeuo pipefail
command -v docker >/dev/null || { echo 'ERROR: Docker chưa được cài.'; exit 1; }
docker info >/dev/null 2>&1 || { echo 'ERROR: Docker Desktop/Engine chưa chạy.'; exit 1; }
docker compose version >/dev/null || { echo 'ERROR: Docker Compose v2 không khả dụng.'; exit 1; }
[ -f .env ] || cp .env.example .env
if grep -q 'CHANGE_ME_STRONG_PASSWORD' .env; then
  PASS=$(openssl rand -hex 24 2>/dev/null || date +%s%N | shasum | cut -c1-32)
  if [[ "$(uname)" == Darwin ]]; then sed -i '' "s/CHANGE_ME_STRONG_PASSWORD/$PASS/" .env; else sed -i "s/CHANGE_ME_STRONG_PASSWORD/$PASS/" .env; fi
fi
echo 'Preflight OK.'
