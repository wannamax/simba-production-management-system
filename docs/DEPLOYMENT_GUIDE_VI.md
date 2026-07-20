# Hướng dẫn triển khai tập trung

## 1. Máy chủ đề nghị
- 2–4 CPU, RAM 4–8 GB, SSD 40 GB trở lên.
- macOS/Windows: Docker Desktop. Linux: Docker Engine + Compose v2.
- Máy chủ nên dùng IP tĩnh trong mạng LAN.

## 2. Cài đặt
Giải nén, mở Terminal tại thư mục dự án rồi chạy:
```bash
chmod +x scripts/*.sh
./scripts/install.sh
```
Script tự tạo `.env`, mật khẩu database ngẫu nhiên, build và chạy hệ thống.

## 3. Truy cập
- Trên máy chủ: `http://localhost:8080`
- Máy khác: `http://<IP-máy-chủ>:8080`

## 4. Sao lưu
```bash
./scripts/backup.sh
```
Nên sao chép thư mục `backups/` sang ổ đĩa khác hoặc cloud mỗi ngày.

## 5. Khôi phục
```bash
./scripts/restore.sh backups/pms_YYYYMMDD_HHMMSS.dump
```
Nên thử trên máy test trước khi khôi phục production.

## 6. Cập nhật
```bash
./scripts/update.sh
```
Lệnh này backup trước, build lại, rồi dọn image cũ.

## 7. Xử lý sự cố
```bash
./scripts/status.sh
docker compose logs -f backend
docker compose logs -f db
```
Không chạy `docker compose down -v` trừ khi chủ động xóa toàn bộ dữ liệu.
