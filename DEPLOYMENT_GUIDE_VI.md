# Hướng dẫn triển khai tập trung

## Kiến trúc
- 1 máy chủ chạy Docker Compose.
- PostgreSQL chỉ chạy trong mạng Docker, không mở ra LAN.
- Nginx phục vụ React và chuyển `/api` vào Node.js.
- Máy khách chỉ cần trình duyệt.

## Yêu cầu máy chủ
- Ubuntu 22.04/24.04, Debian 12 hoặc Windows 11 + Docker Desktop.
- Khuyến nghị: 4 CPU, RAM 8 GB, SSD 50 GB.
- IP LAN tĩnh, ví dụ `192.168.1.50`.

## Cài đặt
1. Cài Docker Engine + Docker Compose plugin.
2. Giải nén dự án.
3. Sao chép cấu hình:
   ```bash
   cp .env.example .env
   ```
4. Mở `.env`, đổi `POSTGRES_PASSWORD` thành mật khẩu mạnh.
5. Khởi động:
   ```bash
   docker compose up -d --build
   ```
6. Kiểm tra:
   ```bash
   docker compose ps
   docker compose logs -f --tail=100
   ```
7. Truy cập trên máy chủ: `http://localhost:8080`.
8. Máy khác trong LAN: `http://IP_MAY_CHU:8080`.

## Sao lưu
```bash
mkdir -p backups
docker compose exec -T db pg_dump -U pms_app -d production_management -Fc > backups/pms-$(date +%F-%H%M).dump
```

## Khôi phục
Dừng người dùng truy cập, sau đó:
```bash
docker compose exec -T db dropdb -U pms_app production_management
docker compose exec -T db createdb -U pms_app production_management
cat backups/TEN_FILE.dump | docker compose exec -T db pg_restore -U pms_app -d production_management --clean --if-exists
```

## Cập nhật phiên bản
```bash
docker compose down
docker compose up -d --build
```
Không dùng `docker compose down -v` trừ khi muốn xóa toàn bộ dữ liệu.

## Reset dữ liệu thử nghiệm
```bash
docker compose down -v
docker compose up -d --build
```

## Bảo mật vận hành
- Không mở cổng PostgreSQL 5432 ra mạng LAN/Internet.
- Không commit file `.env`.
- Backup hằng ngày sang ổ khác hoặc NAS.
- Chỉ công khai qua Internet khi có HTTPS, firewall và VPN/reverse proxy phù hợp.
