# Simba PMS 2.2.0 — Production Installer

Gói này không chứa source, Dockerfile, npm hay bước build. Image phải được pipeline GitHub Actions phát hành trước lên GHCR.

## Cài đặt
1. Cài và mở Docker Desktop hoặc Docker Engine.
2. Chạy `./install.sh`.
3. Mở `http://localhost:8080`.

Nếu package GHCR private, điền `GHCR_USERNAME` và `GHCR_TOKEN` trong `.env`. Tốt nhất chuyển hai package image sang Public để máy nội bộ không cần token.

## Vận hành
- Backup: `./scripts/backup.sh`
- Restore: `./scripts/restore.sh backups/<file>.dump`
- Status/log: `./scripts/status.sh`
- Update: `./scripts/update.sh 2.2.1`

Không chạy `docker compose build`, `npm ci` hay `npm install` trên máy production.
