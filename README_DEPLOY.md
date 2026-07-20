# Production Management System — Centralized Edition

Khởi động nhanh:
```bash
cp .env.example .env
# đổi POSTGRES_PASSWORD trong .env
docker compose up -d --build
```
Mở `http://localhost:8080` hoặc `http://IP_MAY_CHU:8080`.

Tài liệu:
- `DEPLOYMENT_GUIDE_VI.md`: cài đặt, backup, restore.
- `BUG_REPORT_VI.md`: lỗi và thay đổi kỹ thuật.
