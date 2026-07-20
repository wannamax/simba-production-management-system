#!/usr/bin/env sh
set -eu
[ $# -eq 1 ] || { echo "Dùng: ./scripts/restore.sh backups/file.dump"; exit 1; }
FILE="$1"; [ -s "$FILE" ] || { echo "Không tìm thấy backup"; exit 1; }
cd "$(dirname "$0")/.."; set -a; . ./.env; set +a
printf "Restore sẽ ghi đè dữ liệu. Gõ RESTORE: "; read CONFIRM; [ "$CONFIRM" = RESTORE ] || exit 1
docker compose -f compose.yml --env-file .env stop backend web
cat "$FILE" | docker compose -f compose.yml --env-file .env exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner
docker compose -f compose.yml --env-file .env start backend web
./scripts/smoke-test.sh
