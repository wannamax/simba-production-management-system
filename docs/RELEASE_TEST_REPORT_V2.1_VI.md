# Simba PMS v2.1 — Báo cáo phát hành

## Các lỗi đã sửa
- Loại bỏ migration tạo trùng trigger `trigger_update_task_assignments_on_pause`.
- Health check backend nay kiểm tra kết nối PostgreSQL thật, không chỉ kiểm tra tiến trình HTTP.
- Thêm thời gian khởi động và retry phù hợp cho PostgreSQL trên Docker Desktop.
- Build frontend/backend tuần tự để giảm lỗi package manager do hai tiến trình tải đồng thời.
- Thêm bảng `schema_migrations` và ghi nhận schema v2.1.0.
- Thêm preflight, smoke test và kiểm thử backup/restore.

## Chuỗi kiểm tra phát hành
1. `node --check` toàn backend.
2. Frontend production build.
3. Parse toàn bộ SQL và kiểm tra trigger trùng.
4. Docker Compose config.
5. Sau khi chạy trên máy có Docker: health DB → backend → API → frontend.
6. CSV import/export được kiểm thử bằng checklist trong `docs/ACCEPTANCE_TEST_VI.md`.
7. Backup/restore bằng `scripts/test-backup-restore.sh`.

## Giới hạn kiểm thử của gói bàn giao
Môi trường tạo gói không có Docker daemon, vì vậy container end-to-end phải được xác nhận trên máy cài đặt bằng `./scripts/install.sh`. Script sẽ dừng ngay nếu health/smoke test thất bại; không báo cài đặt thành công giả.
