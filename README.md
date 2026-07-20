# Simba Production Management System v2.1

Bản phát hành sạch cho triển khai tập trung: React + Node.js 22 + PostgreSQL + Nginx + Docker Compose.

## Cài đặt
```bash
chmod +x scripts/*.sh
./scripts/install.sh
```
Mở `http://localhost:8080`.

## Kiểm tra
```bash
./scripts/smoke-test.sh
./scripts/status.sh
```

## Backup/restore
```bash
./scripts/backup.sh
./scripts/restore.sh backups/<file>.dump
```

Xem `docs/DEPLOYMENT_GUIDE_VI.md`, `docs/RELEASE_TEST_REPORT_V2.1_VI.md` và `docs/ACCEPTANCE_TEST_VI.md`.
