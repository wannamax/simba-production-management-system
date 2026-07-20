# Báo cáo triển khai Simba PMS 2.2.1

## Phạm vi đã thực hiện

### UAT và độ ổn định
- Script `scripts/uat-local.sh` kiểm tra container/API/endpoint chính và template Excel.
- Checklist nghiệp vụ tại `docs/UAT_2.2.1_VI.md`.
- Script `scripts/test-persistence.sh` tạo marker, recreate container và xác nhận volume giữ dữ liệu.
- CI bổ sung bài test persistence qua `docker compose down/up`.

### Backup/restore
- Production installer có `scripts/backup.sh` tạo PostgreSQL custom dump và kiểm tra file không rỗng.
- `scripts/restore.sh` yêu cầu xác nhận, dừng ứng dụng, restore và chạy smoke test.
- CI restore vào database `restore_test`, không ghi đè database kiểm thử chính.

### Chuẩn hóa release
- Backend/frontend/package version: 2.2.1.
- Workflow và image tag: 2.2.1.
- Production installer mặc định: 2.2.1.
- Release notes: `RELEASE_2.2.1_VI.md`.

### Import Excel
- Màn hình `/data-transfer`.
- Hỗ trợ Khách hàng, Nhân viên, Dự án, Công việc.
- Template XLSX theo từng loại.
- Dry-run/preview trước khi ghi.
- Kiểm tra cột và trường bắt buộc.
- Toàn bộ import chạy trong một transaction: một dòng lỗi thì không ghi dòng nào.

### Export Excel
- Xuất Khách hàng, Nhân viên, Dự án, Công việc.
- XLSX Unicode, header cố định, freeze header và auto filter.

### Test tự động
- API health.
- Download template.
- Import preview.
- Import thật và xác nhận dữ liệu tăng.
- Export và đọc lại workbook.
- Persistence qua container recreation.
- Backup/restore database.

## Giới hạn đã biết
- Import 2.2.1 chỉ thêm mới, chưa upsert theo mã.
- Chưa có đăng nhập/phân quyền và audit log thực tế.
- UAT giao diện cần người vận hành xác nhận vì môi trường build không có trình duyệt và Docker daemon.
