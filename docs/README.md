<div align="center">

# 🏭 Production Management System

### Hệ thống Quản lý Sản xuất & Lắp đặt Quảng cáo

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v18.2-blue.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v14+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Giải pháp toàn diện cho quản lý dự án, nhiệm vụ, nhân sự và báo cáo**

[Tính năng](#-tính-năng-chính) • [Cài đặt](#-cài-đặt) • [Sử dụng](#-hướng-dẫn-sử-dụng) • [API](#-api-documentation) • [Đóng góp](#-đóng-góp)

</div>

---

## 📋 Mục lục

- [Tổng quan](#-tổng-quan)
- [Tính năng chính](#-tính-năng-chính)
- [Công nghệ sử dụng](#-công-nghệ-sử-dụng)
- [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
- [Cài đặt](#-cài-đặt)
- [Cấu hình](#-cấu-hình)
- [Hướng dẫn sử dụng](#-hướng-dẫn-sử-dụng)
- [Workflow](#-workflow)
- [API Documentation](#-api-documentation)
- [Database Schema](#-database-schema)
- [Troubleshooting](#-troubleshooting)
- [Roadmap](#-roadmap)
- [Đóng góp](#-đóng-góp)
- [License](#-license)

---

## 🎯 Tổng quan

**Production Management System** là giải pháp quản lý toàn diện cho các doanh nghiệp sản xuất và lắp đặt sản phẩm quảng cáo như bảng hiệu, kệ trưng bày, booth...

### 🌟 Điểm nổi bật

- ✅ **Quản lý toàn diện**: Từ dự án, nhiệm vụ đến nhân sự
- 📊 **Báo cáo chi tiết**: Theo ngày/tuần/tháng với biểu đồ trực quan
- 🔄 **Workflow linh hoạt**: Tạm dừng, tiếp tục, hủy nhiệm vụ dễ dàng
- 👥 **Quản lý nhân sự thông minh**: Tự động cập nhật tình trạng "bận/rảnh"
- 📍 **Quản lý địa điểm**: Import hàng loạt từ CSV, edit inline
- 📱 **Desktop App**: Chạy offline với Electron
- 🔐 **Bảo mật**: Soft delete, audit trail, phân quyền

---

## 🚀 Tính năng chính

### 1. 📁 Quản lý Dự án

- Tạo/sửa/xóa dự án (soft delete)
- Phân loại theo loại sản phẩm
- Quản lý ngân sách và chi phí
- Theo dõi tiến độ realtime
- Phân công nhân sự vào dự án
- Thùng rác (khôi phục dự án đã xóa)

### 2. ✅ Quản lý Nhiệm vụ (Tasks)

- **3 loại nhiệm vụ**: Sản xuất, Giao hàng, Lắp đặt
- **Quản lý địa điểm**:
  - Thêm thủ công hoặc import CSV
  - Edit inline mọi thông tin
  - Theo dõi tiến độ từng địa điểm
- **Trạng thái linh hoạt**:
  - ⏸️ **Tạm dừng**: Giải phóng nhân viên, có thể tiếp tục
  - ▶️ **Tiếp tục**: Gán lại nhân viên tự động
  - ⛔ **Hủy**: Hủy vĩnh viễn, giải phóng nhân viên
- **Phân công thông minh**: Chỉ nhân viên trong dự án

### 3. 👥 Quản lý Nhân sự

- Danh sách nhân viên theo phòng ban
- **Tình trạng làm việc**:
  - Tính toán "bận" dựa trên địa điểm đang làm
  - Tự động cập nhật khi task tạm dừng/hủy
  - Chỉ tính địa điểm "Đang lắp đặt"
- Thống kê hiệu suất
- Lịch sử công việc

### 4. 📊 Báo cáo & Thống kê

#### Báo cáo theo Nhiệm vụ
- **Biểu đồ theo ngày**: Line chart 4 đường
  - Tất cả địa điểm
  - Hoàn thành
  - Đang thực hiện
  - Chưa bắt đầu
- **Bộ lọc**: Thời gian, trạng thái
- **Export CSV**: Tùy chỉnh khoảng thời gian
- **Sắp xếp**: Theo ngày, trạng thái, tiến độ

#### Báo cáo Tổng hợp
- Báo cáo ngày: Công việc hàng ngày
- Báo cáo tuần: Tổng hợp theo dự án
- Báo cáo tháng: Hiệu suất toàn diện

### 5. 🗓️ Lịch trình Công việc

- Lịch làm việc trực quan
- Phân công nhân viên
- Check-in/Check-out
- Cảnh báo quá hạn

### 6. 📦 Quản lý Vật tư

- Theo dõi tồn kho
- Cảnh báo vật tư sắp hết
- Ghi nhận chi phí theo dự án

---

## 💻 Công nghệ sử dụng

### Backend
├── Node.js v18+          - Runtime
├── Express.js v4.18      - Web framework
├── PostgreSQL v14+       - Database
├── JWT                   - Authentication
├── Multer                - File upload
├── ExcelJS               - Export Excel
├── Papa Parse            - CSV parsing
└── Node-cron             - Scheduled tasks

### Frontend

├── React v18.2           - UI Library
├── Ant Design v5         - UI Framework
├── Recharts              - Charts
├── Axios                 - HTTP client
├── Day.js                - Date handling
├── Electron              - Desktop wrapper
└── React Router v6       - Routing

### Optional Services (Free Tier)
├── Supabase              - File storage & Realtime
└── SendGrid              - Email notifications

---

## 📋 Yêu cầu hệ thống

### Phần cứng tối thiểu
- **RAM**: 4GB (khuyến nghị 8GB)
- **CPU**: Dual-core 2.0GHz+
- **Disk**: 2GB trống
- **OS**: Windows 10+, macOS 10.14+, Ubuntu 20.04+

### Phần mềm cần thiết
- **Node.js**: v18.0.0 trở lên ([Download](https://nodejs.org/))
- **PostgreSQL**: v14.0 trở lên ([Download](https://www.postgresql.org/download/))
- **Git**: Để clone repository
- **Code Editor**: VS Code (khuyến nghị)

---

## 🔧 Cài đặt

### Bước 1: Clone Repository

git clone https://github.com/yourusername/production-management.git
cd production-management

Bước 2: Cài đặt PostgreSQL
Windows
# Sử dụng Chocolatey
choco install postgresql

# Hoặc download installer từ postgresql.org
macOS
brew install postgresql@14
brew services start postgresql@14
Linux (Ubuntu/Debian)
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
Bước 3: Tạo Database
# Đăng nhập PostgreSQL
psql -U postgres

# Tạo database
CREATE DATABASE production_management;

# Thoát
\q

# Import schema
psql -U postgres -d production_management -f backend/database.sql

# Import migrations
psql -U postgres -d production_management -f backend/migrations/002_add_soft_delete.sql
psql -U postgres -d production_management -f backend/migrations/003_create_system_logs.sql
psql -U postgres -d production_management -f backend/migrations/004_add_task_pause.sql
Bước 4: Cấu hình Backend
cd backend

# Cài đặt dependencies
npm install

# Tạo file .env
cp .env.example .env

# Chỉnh sửa .env với thông tin của bạn
nano .env
.env Configuration:
envCopyPORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=production_management
DB_USER=postgres
DB_PASSWORD=your_password_here

JWT_SECRET=your-super-secret-jwt-key-change-in-production

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
Bước 5: Cấu hình Frontend
cd ../frontend

# Cài đặt dependencies
npm install

# Tạo file .env
cp .env.example .env

# Chỉnh sửa
nano .env
Frontend .env:
envCopyREACT_APP_API_URL=http://localhost:3000/api
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_KEY=your-anon-key
Bước 6: Khởi động Ứng dụng
Development Mode
# Terminal 1: Backend
cd backend
npm start
# Server chạy tại: http://localhost:3000

# Terminal 2: Frontend (Web)
cd frontend
npm start
# App chạy tại: http://localhost:3001

# Terminal 2: Frontend (Electron Desktop)
cd frontend
npm run electron-dev
Production Build
# Backend
cd backend
npm start

# Frontend - Build
cd frontend
npm run build

# Electron - Build Desktop App
npm run electron-build

# Output:
# Windows: dist/Production Management Setup.exe
# macOS: dist/Production Management.dmg
# Linux: dist/Production Management.AppImage

⚙️ Cấu hình
Sử dụng Scripts Tự động
Windows
# Setup tự động
.\scripts\setup-windows.bat

# Khởi động
.\scripts\start-all-windows.bat

# Backup database
.\scripts\backup-database.bat
macOS/Linux
# Cấp quyền
chmod +x scripts/*.sh

# Setup
./scripts/setup-unix.sh

# Khởi động
./scripts/start-all-unix.sh

# Backup
./scripts/backup-database.sh
Docker (Optional)
# Build và start
docker-compose up -d

# Stop
docker-compose down

# Xem logs
docker-compose logs -f

# Services:
# - Frontend: http://localhost:3001
# - Backend: http://localhost:3000
# - PostgreSQL: localhost:5432

📖 Hướng dẫn sử dụng
1. Khởi tạo Hệ thống
Bước 1: Tạo Khách hàng
CopyMenu: Khách hàng → [+ Thêm mới]

Điền thông tin:
- Tên công ty
- Người liên hệ
- Số điện thoại
- Email
- Địa chỉ
- Mã số thuế
Bước 2: Tạo Nhân viên
CopyMenu: Nhân viên → [+ Thêm mới]

Điền thông tin:
- Họ tên
- Vị trí (Thợ sản xuất, Thợ lắp đặt, Quản lý...)
- Phòng ban (Sản xuất, Lắp đặt, Thiết kế...)
- Số điện thoại
- Email
2. Quản lý Dự án
Tạo Dự án mới
CopyMenu: Dự án → [+ Tạo dự án mới]

1. Thông tin cơ bản:
   - Tên dự án
   - Loại dự án (Bảng hiệu, Kệ trưng bày...)
   - Khách hàng
   - Ngày bắt đầu/kết thúc
   - Ngân sách
   - Mức độ ưu tiên

2. Phân công Nhân sự:
   - Chọn nhân viên từ Transfer component
   - Gán vai trò cho từng người:
     • Quản lý dự án
     • Trưởng nhóm sản xuất
     • Trưởng nhóm lắp đặt
     • Thợ sản xuất
     • Thợ lắp đặt

3. [Tạo mới] → Dự án được khởi tạo
3. Quản lý Nhiệm vụ
Tạo Nhiệm vụ Lắp đặt
CopyMenu: Nhiệm vụ → [+ Tạo nhiệm vụ mới]

1. Thông tin Nhiệm vụ:
   - Chọn Dự án
   - Loại: "Lắp đặt"
   - Tên nhiệm vụ: "Lắp đặt 50 chi nhánh"
   - Ngày bắt đầu/kết thúc
   - Ước tính số giờ

2. [Tạo mới] → Vào Chi tiết Nhiệm vụ
Thêm Địa điểm Lắp đặt
Cách 1: Thêm thủ công
CopyTab: Địa điểm lắp đặt → [+ Thêm địa điểm]

Điền thông tin:
- Tên địa điểm: "Chi nhánh Quận 1"
- Địa chỉ: "123 Nguyễn Huệ, Q1, TP.HCM"
- Người liên hệ + SĐT
- Ngày lắp đặt
- Giờ: 08:00 - 12:00
- Số giờ dự kiến: 4h
- Thông tin sản phẩm
- Mô tả công việc
Cách 2: Import CSV
Copy1. [Tải template CSV] → Download file mẫu
2. Mở Excel/Google Sheets
3. Điền thông tin 50 địa điểm
4. Lưu định dạng CSV
5. [Import CSV] → Chọn file → Upload
6. ✅ Hệ thống import tự động
Phân công Nhân viên
CopyTab: Nhân sự → [+ Phân công]

1. Chọn nhân viên (chỉ hiện nhân viên trong dự án)
2. Chọn vai trò:
   - Trưởng nhóm
   - Thợ chính
   - Thợ phụ
   - Giám sát
3. Ngày bắt đầu/kết thúc
4. [Phân công]

✅ Nhân viên được gán vào nhiệm vụ
✅ Tự động tính "Bận" dựa trên địa điểm đang làm
4. Quản lý Trạng thái Nhiệm vụ
⏸️ Tạm dừng Nhiệm vụ
CopyKhi nào dùng:
- Khách hàng yêu cầu tạm dừng
- Đợi duyệt thiết kế
- Chưa có vật tư

Cách thực hiện:
1. Vào Chi tiết Nhiệm vụ
2. Click [Tạm dừng]
3. Nhập lý do (bắt buộc, tối thiểu 10 ký tự)
4. [Xác nhận Tạm dừng]

Kết quả:
✅ Nhiệm vụ chuyển sang "Tạm dừng"
✅ TẤT CẢ nhân viên được giải phóng
✅ Địa điểm chưa làm KHÔNG tính vào khối lượng
✅ Có thể "Tiếp tục" sau

Kiểm tra:
Menu: Nhân viên → Tình trạng làm việc
→ Nhân viên không còn "Bận" với task này
▶️ Tiếp tục Nhiệm vụ
Copy1. Click [Tiếp tục]
2. Xác nhận

Kết quả:
✅ Nhiệm vụ chuyển sang "Đang thực hiện"
✅ Nhân viên được gán lại tự động
✅ Tính lại khối lượng công việc
⛔ Hủy Nhiệm vụ
CopyKhi nào dùng:
- Khách hàng hủy hợp đồng
- Thay đổi kế hoạch hoàn toàn
- Không thể thực hiện

Cách thực hiện:
1. Click [Hủy nhiệm vụ]
2. Nhập lý do (bắt buộc)
3. [Xác nhận Hủy]

⚠️ CẢNH BÁO:
- Hành động KHÔNG THỂ HOÀN TÁC
- Tất cả địa điểm chưa làm bị đánh dấu "Hủy"
- Nhân viên được giải phóng vĩnh viễn
5. Báo cáo
Tab Báo cáo trong Nhiệm vụ
CopyChi tiết Nhiệm vụ → Tab: Báo cáo

1. Bộ lọc:
   - Khoảng thời gian: [Từ ngày] → [Đến ngày]
   - Trạng thái: Tất cả/Hoàn thành/Đang thực hiện/Chưa bắt đầu
   - Click [Làm mới]

2. Thống kê nhanh:
   - Tổng địa điểm
   - Hoàn thành
   - Đang thực hiện
   - Chưa bắt đầu

3. Biểu đồ Line Chart:
   - 4 đường theo ngày
   - Hover để xem chi tiết
   - Zoom in/out

4. Danh sách chi tiết:
   - Tất cả thông tin địa điểm
   - Sắp xếp: Click vào header cột
   - Sort theo: Ngày, Trạng thái, Tiến độ

5. Export CSV:
   - Click [Tải xuống CSV]
   - File tự động download
   - Tên: Task_[Mã]_Report_[Ngày]_[Ngày].csv
   - Mở bằng Excel để xem/in
Báo cáo Tổng hợp
CopyMenu: Báo cáo

Báo cáo Ngày:
- Chọn ngày
- Xem công việc của tất cả nhân viên trong ngày
- Export PDF/Excel

Báo cáo Tuần:
- Chọn tuần
- Tổng hợp theo dự án
- Tổng giờ làm việc
- Tiến độ trung bình

Báo cáo Tháng:
- Chọn tháng/năm
- Hiệu suất toàn diện
- Chi phí thực tế vs Dự toán
- Top nhân viên xuất sắc
6. Tình trạng Nhân viên
CopyMenu: Nhân viên → Tình trạng làm việc

1. Bộ lọc:
   - Chọn nhân viên (multi-select)
   - Khoảng thời gian
   - Dự án

2. Click [Lọc danh sách]

3. Xem kết quả:
   - Rảnh: 🟢 Không có nhiệm vụ
   - Bận một phần: 🟡 < 100% khối lượng
   - Bận: 🔴 ≥ 100% khối lượng

4. Click vào tên nhân viên → Xem chi tiết:
   - Dự án đang tham gia
   - Nhiệm vụ đang làm
   - Lịch trình sắp tới
   - Tổng giờ làm việc

Lưu ý:
✅ Chỉ tính địa điểm "Đang lắp đặt"
✅ Địa điểm "Chưa bắt đầu" KHÔNG tính
✅ Nhiệm vụ "Tạm dừng" KHÔNG tính
✅ Nhiệm vụ "Hủy" KHÔNG tính

🔄 Workflow
mermaidCopygraph TD
    A[Tạo Khách hàng] --> B[Tạo Nhân viên]
    B --> C[Tạo Dự án]
    C --> D[Phân công Nhân sự vào Dự án]
    D --> E[Tạo Nhiệm vụ]
    E --> F[Thêm Địa điểm Import CSV hoặc Thủ công]
    F --> G[Phân công Nhân sự vào Nhiệm vụ]
    G --> H{Trạng thái}
    H -->|Đang làm| I[Cập nhật Tiến độ]
    H -->|Cần dừng| J[Tạm dừng]
    H -->|Không làm nữa| K[Hủy]
    J --> L[Tiếp tục]
    L --> I
    I --> M[Báo cáo]
    M --> N{Hoàn thành?}
    N -->|Yes| O[Đánh dấu Hoàn thành]
    N -->|No| I
    O --> P[Xuất Báo cáo Tổng hợp]

🔌 API Documentation
Base URL
http://localhost:3000/api
Authentication
javascriptCopy// Header
{
  "Authorization": "Bearer {token}"
}
Endpoints
Projects
httpCopyGET    /api/projects                    # Lấy danh sách dự án
GET    /api/projects/:id                # Chi tiết dự án
POST   /api/projects                    # Tạo dự án mới
PUT    /api/projects/:id                # Cập nhật dự án
DELETE /api/projects/:id                # Xóa dự án (soft delete)
POST   /api/projects/:id/restore        # Khôi phục dự án
GET    /api/projects/trash/list         # Danh sách đã xóa
DELETE /api/projects/:id/permanent      # Xóa vĩnh viễn

# Project Assignments
POST   /api/projects/:id/assignments    # Phân công nhân sự
GET    /api/projects/:id/assignments    # Danh sách phân công
DELETE /api/projects/:projectId/assignments/:id  # Xóa phân công
Tasks
httpCopyGET    /api/tasks                       # Danh sách nhiệm vụ
GET    /api/tasks/:id                   # Chi tiết nhiệm vụ
POST   /api/tasks                       # Tạo nhiệm vụ
PUT    /api/tasks/:id                   # Cập nhật nhiệm vụ
DELETE /api/tasks/:id                   # Xóa nhiệm vụ
PATCH