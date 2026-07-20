# Simba PMS 2.2.1

## Hoàn thành
- Docker/GHCR production release ổn định.
- Migration PostgreSQL và health check được sửa.
- Import/Export Excel cho Khách hàng, Nhân viên, Dự án và Công việc.
- Import có bước dry-run/preview, kiểm tra cột bắt buộc và transaction toàn bộ file.
- Export tạo XLSX chuẩn UTF-8/Unicode.
- Bổ sung UAT kỹ thuật, persistence, backup/restore và integration smoke test.
- Production installer mặc định dùng image 2.2.1.

## Ghi chú
Import hiện tạo bản ghi mới. Cập nhật/upsert và hoàn tác import nằm trong roadmap tiếp theo.
