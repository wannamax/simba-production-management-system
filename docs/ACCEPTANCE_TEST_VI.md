# Checklist nghiệm thu Simba PMS v2.1

1. Chạy `./scripts/install.sh`; ba service phải healthy.
2. Mở Dashboard và danh sách dự án.
3. Tạo khách hàng, dự án, nhân viên và task thử nghiệm.
4. Trong task, tải template CSV; nhập ít nhất hai địa điểm; import và kiểm tra số dòng.
5. Mở báo cáo task; xuất CSV; mở bằng Excel và kiểm tra tiếng Việt.
6. Chạy `./scripts/backup.sh`.
7. Chạy `./scripts/test-backup-restore.sh` trên dữ liệu thử nghiệm.
8. Chỉ nhập dữ liệu thật sau khi toàn bộ bước đạt.
