# UAT Simba PMS 2.2.1

## Kiểm tra tự động
- [ ] `scripts/uat-local.sh`
- [ ] `scripts/test-persistence.sh`
- [ ] `scripts/test-backup-restore.sh`

## Kiểm tra nghiệp vụ trên giao diện
- [ ] Khách hàng: tạo, sửa, tìm kiếm, xóa
- [ ] Nhân viên: tạo, sửa, lọc trạng thái
- [ ] Dự án: tạo, sửa, gắn khách hàng, đổi trạng thái
- [ ] Công việc: tạo, sửa, phân công, hoàn thành, lưu trữ
- [ ] Lịch trình và báo cáo hiển thị đúng
- [ ] Dashboard khớp dữ liệu vừa nhập
- [ ] Import Excel: tải mẫu, preview, import, báo lỗi dòng
- [ ] Export Excel: tải được, mở được, tiếng Việt đúng

## Tiêu chí đạt
Không có lỗi HTTP 500; dữ liệu còn sau down/up; backup restore thành công; toàn bộ container healthy.
