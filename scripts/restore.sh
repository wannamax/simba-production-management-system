#!/usr/bin/env bash
set -euo pipefail
[ $# -eq 1 ] || { echo "Cách dùng: ./scripts/restore.sh backups/file.dump"; exit 1; }
cd "$(dirname "$0")/.."
set -a; source .env; set +a
FILE="$1"; [ -f "$FILE" ] || { echo "Không thấy $FILE"; exit 1; }
cat "$FILE" | docker compose exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner
