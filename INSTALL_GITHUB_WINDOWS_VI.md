# Cài Simba PMS 2.6.0-I từ GitHub trên Windows

Tài liệu này áp dụng cho branch `release/v2.6.0-I` của repository:

`https://github.com/wannamax/simba-production-management-system`

Mô hình triển khai: một máy PC chạy Docker Desktop làm máy chủ Simba PMS. Người dùng trên máy chủ hoặc các máy khác trong mạng LAN truy cập bằng trình duyệt.

## 1. Chuẩn bị máy PC

Khuyến nghị:

- Windows 11 64-bit.
- CPU 4 nhân trở lên, RAM 8 GB trở lên, SSD còn trống ít nhất 50 GB.
- Cài Docker Desktop và bật WSL 2 khi trình cài đặt yêu cầu.
- Cài Git for Windows.
- Khởi động Docker Desktop và chờ trạng thái Docker Engine chuyển sang Running.

Mở PowerShell và kiểm tra:

```powershell
docker version
docker compose version
git --version
```

Chỉ tiếp tục khi cả ba lệnh đều hoạt động.

## 2. Tải đúng branch từ GitHub

Chọn thư mục sẽ lưu ứng dụng, sau đó chạy:

```powershell
git clone --branch release/v2.6.0-I --single-branch https://github.com/wannamax/simba-production-management-system.git
cd simba-production-management-system
```

Kiểm tra branch hiện tại:

```powershell
git branch --show-current
```

Kết quả phải là:

```text
release/v2.6.0-I
```

Không sử dụng thư mục `release/production` cũ để cài bản này. Bộ cài đó vẫn cần được chuẩn hóa riêng cho dòng 2.6.

## 3. Tạo cấu hình riêng cho máy

Từ thư mục gốc của dự án:

```powershell
Copy-Item .env.example .env
notepad .env
```

Cấu hình tối thiểu:

```env
POSTGRES_DB=simba_pms
POSTGRES_USER=simba
POSTGRES_PASSWORD=THAY_BANG_MAT_KHAU_MANH
APP_PORT=8080
TZ=Asia/Ho_Chi_Minh
```

Yêu cầu với mật khẩu database:

- Dùng mật khẩu riêng, tối thiểu 16 ký tự.
- Không để nguyên `CHANGE_ME_STRONG_PASSWORD`.
- Không gửi file `.env` lên GitHub.
- Lưu mật khẩu ở nơi an toàn vì cần dùng khi khôi phục hoặc xử lý sự cố.

## 4. Build và khởi động ứng dụng

Vẫn đứng trong thư mục gốc của dự án, chạy:

```powershell
docker compose up -d --build
```

Lần đầu có thể mất nhiều phút vì Docker phải tải image nền, cài dependency và build backend/frontend.

Kiểm tra trạng thái:

```powershell
docker compose ps
```

Các service `db`, `backend` và `web` phải ở trạng thái `Up`; các service có healthcheck phải chuyển sang `healthy`.

Nếu cần xem lỗi:

```powershell
docker compose logs --tail=200
```

## 5. Truy cập Simba PMS

Trên máy cài đặt, mở:

`http://localhost:8080`

Tài khoản khởi tạo cho database mới:

- Tên đăng nhập: `admin`
- Mật khẩu: `admin123`

Hãy đổi mật khẩu quản trị ngay sau khi xác nhận đăng nhập thành công.

## 6. Cho phép máy khác trong mạng LAN truy cập

Lấy địa chỉ IPv4 của máy chủ:

```powershell
ipconfig
```

Ví dụ máy chủ có IPv4 là `192.168.1.50`, máy khác trong cùng mạng truy cập:

`http://192.168.1.50:8080`

Nếu không truy cập được:

1. Cho phép Docker Desktop qua Windows Defender Firewall.
2. Tạo inbound rule cho TCP port `8080` trong mạng Private.
3. Nên đặt IP LAN tĩnh hoặc DHCP reservation cho máy chủ.
4. Không mở port PostgreSQL `5432` ra LAN hoặc Internet.

## 7. Dừng và chạy lại ứng dụng

Dừng container nhưng giữ nguyên dữ liệu:

```powershell
docker compose stop
```

Chạy lại:

```powershell
docker compose start
```

Hoặc đồng bộ lại trạng thái service:

```powershell
docker compose up -d
```

Tuyệt đối không chạy `docker compose down -v`. Tùy chọn `-v` sẽ xóa volume database và dữ liệu tải lên.

## 8. Cập nhật branch 2.6.0-I

Trước khi cập nhật, phải sao lưu database. Sau đó chạy trong thư mục dự án:

```powershell
git status
git pull --ff-only origin release/v2.6.0-I
docker compose up -d --build
docker compose ps
```

Nếu `git status` báo có file source đã sửa trên máy production, không được tự ý reset hoặc ghi đè; cần kiểm tra các thay đổi đó trước.

## 9. Sao lưu database trên Windows

Tạo thư mục backup:

```powershell
New-Item -ItemType Directory -Force backups
```

Tạo file dump bên trong container rồi chép ra máy Windows:

```powershell
docker compose exec -T db pg_dump -U simba -d simba_pms -Fc -f /tmp/simba_pms.dump
docker compose cp db:/tmp/simba_pms.dump .\backups\simba_pms.dump
docker compose exec -T db rm -f /tmp/simba_pms.dump
```

Nên đổi tên file theo ngày giờ và sao chép thêm sang ổ cứng khác hoặc NAS. Backup chỉ nằm trên cùng máy chủ không đủ an toàn.

## 10. Khôi phục dữ liệu sang máy mới

Chỉ thực hiện khi đã xác định đúng file backup. Tạm ngừng người dùng truy cập ứng dụng, sau đó:

```powershell
docker compose cp .\backups\simba_pms.dump db:/tmp/simba_pms.dump
docker compose exec -T db pg_restore -U simba -d simba_pms --clean --if-exists --no-owner /tmp/simba_pms.dump
docker compose exec -T db rm -f /tmp/simba_pms.dump
docker compose restart backend web
docker compose ps
```

Khôi phục bằng `--clean` thay thế các đối tượng database hiện có. Phải tạo một bản backup mới của dữ liệu đang chạy trước khi thực hiện.

## 11. Cài theo tag cố định

Branch `release/v2.6.0-I` có thể nhận thêm hotfix. Nếu cần tái tạo đúng nguyên trạng bản phát hành ban đầu, dùng tag bất biến:

```powershell
git clone --branch v2.6.0-I --depth 1 https://github.com/wannamax/simba-production-management-system.git
```

Quy ước:

- Cài và nhận hotfix của dòng hiện tại: dùng branch `release/v2.6.0-I`.
- Tái tạo đúng mốc phát hành: dùng tag `v2.6.0-I`.
- Phát triển phiên bản mới: dùng branch phiên bản mới, không tiếp tục phát triển trên branch 2.6.0-I.

## 12. Kiểm tra sau cài đặt

Sau khi hoàn tất, xác nhận:

- `docker compose ps` không có service bị `Exited` hoặc `unhealthy`.
- Đăng nhập được tại `http://localhost:8080`.
- Trang Tổng quan hiển thị đúng phiên bản Simba PMS.
- Mở được Dự án, Đơn hàng, Kế hoạch sản xuất và Nhiệm vụ.
- Thử tạo một bản ghi kiểm tra và tải lại trang.
- Thực hiện một bản backup đầu tiên và lưu ra thiết bị khác.
