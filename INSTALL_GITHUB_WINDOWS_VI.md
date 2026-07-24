# Cài Simba PMS 2.6.0-K từ GitHub trên Windows

Tài liệu này dành cho mô hình triển khai nội bộ:

- **Máy chủ Simba PMS:** một PC Windows chạy Docker Desktop, chứa application và dữ liệu PostgreSQL.
- **Máy khách:** dùng trình duyệt trong cùng mạng LAN để truy cập máy chủ; **không cần cài Docker hoặc Git**.

Repository:

`https://github.com/wannamax/simba-production-management-system`

> **Lưu ý về branch:** tại thời điểm viết tài liệu, các cập nhật 2.6.0-K đang nằm trên branch `genspark_ai_developer`. Vì vậy máy chủ mới hoặc máy đang cập nhật theo tài liệu này phải dùng branch đó. Không dùng branch cũ `release/v2.6.0-I` nếu cần các chức năng 2.6.0-K.

---

## 1. Chuẩn bị máy chủ Windows

Khuyến nghị:

- Windows 11 64-bit.
- CPU từ 4 nhân, RAM từ 8 GB, SSD trống tối thiểu 50 GB.
- Cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) và bật WSL 2 khi trình cài đặt yêu cầu.
- Cài [Git for Windows](https://git-scm.com/download/win).
- Khởi động Docker Desktop, chờ Docker Engine ở trạng thái **Running**.

Mở PowerShell và kiểm tra:

```powershell
docker version
docker compose version
git --version
```

Chỉ tiếp tục khi cả ba lệnh đều hoạt động.

---

## 2. Tải mã nguồn 2.6.0-K trên máy chủ

Chọn thư mục lưu ứng dụng, ví dụ `C:\Apps`, sau đó chạy PowerShell:

```powershell
cd C:\Apps
git clone --branch genspark_ai_developer --single-branch https://github.com/wannamax/simba-production-management-system.git
cd simba-production-management-system
git branch --show-current
```

Kết quả cuối phải là:

```text
genspark_ai_developer
```

Không dùng thư mục hoặc branch `release/v2.6.0-I` cũ nếu cần các thay đổi 2.6.0-K.

---

## 3. Tạo cấu hình riêng cho máy chủ

Từ thư mục gốc của dự án:

```powershell
Copy-Item .env.example .env
notepad .env
```

Thiết lập tối thiểu:

```env
POSTGRES_DB=simba_pms
POSTGRES_USER=simba
POSTGRES_PASSWORD=THAY_BANG_MAT_KHAU_MANH
APP_PORT=8080
TZ=Asia/Ho_Chi_Minh
```

Yêu cầu bảo mật:

- Đặt mật khẩu database riêng, tối thiểu 16 ký tự.
- Không giữ giá trị `CHANGE_ME_STRONG_PASSWORD`.
- Không đưa file `.env` lên GitHub hoặc gửi qua chat/email không bảo mật.
- Lưu mật khẩu ở nơi an toàn; cần dùng khi backup/khôi phục dữ liệu.

---

## 4. Build và khởi động

Trong thư mục gốc dự án, chạy:

```powershell
docker compose up -d --build
docker compose ps
```

Lần đầu có thể mất vài phút vì Docker cần tải image, cài dependencies và build frontend/backend.

Kết quả mong đợi:

- `db`: `Up` và `healthy`.
- `backend`: `Up` và `healthy`.
- `web`: `Up`.

Xem log khi có lỗi:

```powershell
docker compose logs --tail=200
docker compose logs backend --tail=200
docker compose logs web --tail=200
```

Backend tự chạy các migration mới khi khởi động. Không chỉnh sửa file migration đã được chạy trên database, vì hệ thống kiểm tra checksum migration.

---

## 5. Đăng nhập lần đầu trên máy chủ

Mở trình duyệt trên máy chủ:

```text
http://localhost:8080
```

Với database mới hoàn toàn, tài khoản mẫu là:

- Tên đăng nhập: `admin`
- Mật khẩu: `admin123`

Đổi mật khẩu quản trị ngay sau khi đăng nhập thành công.

---

## 6. Cho máy khách trong LAN truy cập

### 6.1 Lấy IP của máy chủ

Trên máy chủ, chạy:

```powershell
ipconfig
```

Tìm dòng **IPv4 Address** của card mạng đang sử dụng. Ví dụ: `192.168.1.50`.

Máy khách trong cùng mạng LAN mở trình duyệt và truy cập:

```text
http://192.168.1.50:8080
```

Máy khách không cần cài Docker, Git hoặc bất kỳ phần mềm Simba PMS nào.

### 6.2 Mở firewall Windows cho mạng nội bộ

Nếu máy khách không truy cập được, mở PowerShell **Run as Administrator** trên máy chủ và chạy:

```powershell
New-NetFirewallRule -DisplayName "Simba PMS HTTP 8080" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private
```

Sau đó kiểm tra:

1. Máy chủ và máy khách cùng mạng LAN/VPN nội bộ.
2. Docker Desktop đang chạy.
3. `docker compose ps` không có service `Exited` hoặc `unhealthy`.
4. Máy chủ cho phép mạng hiện tại ở profile **Private**.
5. IP máy chủ không bị thay đổi; nên dùng IP tĩnh hoặc DHCP reservation.

Không mở PostgreSQL port `5432` ra LAN hoặc Internet. Docker Compose hiện chỉ công khai web port `8080`.

---

## 7. Luồng vận hành 2.6.0-K cần kiểm tra

Sau khi đăng nhập, kiểm tra nhanh các màn hình:

1. **Đơn hàng → Hồ Sơ Sản Xuất:** tạo Lệnh bằng đúng hai thao tác:
   - `Tạo Lệnh sản xuất trực tiếp`
   - `Tạo Lệnh sản xuất theo quy trình`
2. Sau khi tạo Lệnh, hệ thống chuyển sang **Nhiệm vụ** đúng Công đoạn để tạo và giao việc.
3. Tại **Nhiệm vụ**, bấm Header của Dự án/Lệnh để mở hoặc đóng section; dùng nút **Thêm Công việc** ở Công đoạn để giao việc.
4. Tại **Cài đặt → Quy trình sản xuất**, trường **Liên kết Công việc** có thể để trống hoặc chọn nhiều Công việc liên quan.

Luồng chuẩn là:

> **Hồ sơ sản xuất tạo Lệnh → Nhiệm vụ tạo và giao việc.**

---

## 8. Dừng và chạy lại ứng dụng

Dừng container nhưng giữ dữ liệu:

```powershell
docker compose stop
```

Chạy lại:

```powershell
docker compose start
```

Hoặc đảm bảo toàn bộ service đang chạy:

```powershell
docker compose up -d
```

> **Không chạy `docker compose down -v`** nếu không chủ đích xóa toàn bộ database và file upload. Tùy chọn `-v` sẽ xóa Docker volumes chứa dữ liệu.

---

## 9. Cập nhật máy chủ lên bản mới nhất của branch 2.6.0-K

### 9.1 Bắt buộc backup trước khi cập nhật

Xem hướng dẫn backup ở phần 10. Sau đó kiểm tra thay đổi local:

```powershell
git status
```

Nếu có file source đã sửa trên máy chủ, không chạy `reset --hard` trước khi sao lưu hoặc kiểm tra các thay đổi đó.

### 9.2 Đồng bộ mã nguồn

Khi máy chủ không có thay đổi source cần giữ, chạy:

```powershell
git fetch origin
git switch genspark_ai_developer
git reset --hard origin/genspark_ai_developer
docker compose up -d --build
docker compose ps
```

`git reset --hard` là cần thiết vì branch cập nhật có thể đã được squash/force-push; lệnh này xóa các thay đổi source local chưa commit nhưng **không xóa Docker volume database**.

Sau cập nhật, kiểm tra log backend nếu service chưa healthy:

```powershell
docker compose logs backend --tail=200
```

---

## 10. Sao lưu database trên Windows

Tạo thư mục backup:

```powershell
New-Item -ItemType Directory -Force backups
```

Tạo file dump trong container rồi chép ra máy Windows:

```powershell
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/simba_pms.dump'
docker compose cp db:/tmp/simba_pms.dump .\backups\simba_pms_$(Get-Date -Format yyyyMMdd_HHmmss).dump
docker compose exec -T db rm -f /tmp/simba_pms.dump
```

Sao chép backup sang ổ đĩa khác hoặc NAS. Backup chỉ nằm trên cùng máy chủ không đủ an toàn.

---

## 11. Khôi phục database sang máy chủ mới

Chỉ thực hiện khi đã xác định đúng file backup. Tạm ngừng người dùng truy cập ứng dụng và tạo thêm một backup mới trước khi khôi phục.

Ví dụ với file `simba_pms_20260724_120000.dump`:

```powershell
docker compose cp .\backups\simba_pms_20260724_120000.dump db:/tmp/simba_pms.dump
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/simba_pms.dump'
docker compose exec -T db rm -f /tmp/simba_pms.dump
docker compose restart backend web
docker compose ps
```

`--clean` sẽ thay thế các đối tượng database hiện có. Sau khi khôi phục, kiểm tra đăng nhập và các dữ liệu chính trước khi cho người dùng truy cập lại.

---

## 12. Danh sách kiểm tra sau cài đặt

- `docker compose ps` không có service `Exited` hoặc `unhealthy`.
- Máy chủ mở được `http://localhost:8080`.
- Máy khách LAN mở được `http://IP_MAY_CHU:8080`.
- Đăng nhập được và đã đổi mật khẩu admin.
- Mở được Đơn hàng, Hồ Sơ Sản Xuất và Nhiệm vụ.
- Kiểm tra luồng tạo Lệnh → chuyển sang Nhiệm vụ → giao Công việc.
- Đã tạo một bản backup đầu tiên và lưu ra vị trí khác máy chủ.
