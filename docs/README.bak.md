# 🏭 PRODUCTION MANAGEMENT SYSTEM

## Hệ thống Quản lý Sản xuất & Lắp đặt Sản phẩm Quảng cáo

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![PostgreSQL](https://img.shields.io/badge/postgresql-%3E%3D14.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

### 🎯 Tổng quan

Ứng dụng desktop quản lý toàn bộ quy trình sản xuất và lắp đặt sản phẩm quảng cáo (bảng hiệu, kệ trưng bày, booth...) từ khâu tạo dự án, phân công nhân sự, quản lý nhiệm vụ đến lập báo cáo chi tiết.

### ✨ Tính năng Chính (v1.0.0)

#### ✅ Đã hoàn thành
- 🎯 **Quản lý Dự án**: Tạo, sửa, xóa (soft delete), theo dõi tiến độ
- 👥 **Quản lý Khách hàng**: Thông tin chi tiết, lịch sử dự án
- 👨‍💼 **Quản lý Nhân viên**: Hồ sơ, phân quyền, theo dõi năng suất
- ✅ **Quản lý Nhiệm vụ (Tasks)**:
  - Tạo nhiệm vụ theo loại: Sản xuất, Giao hàng, Lắp đặt
  - Import danh sách địa điểm từ CSV
  - Sửa inline địa điểm
  - Phân công nhân sự
  - **Tạm dừng/Tiếp tục/Hủy nhiệm vụ** ⭐
  - Tự động giải phóng nhân viên khi tạm dừng
- 📊 **Báo cáo Nhiệm vụ**:
  - Biểu đồ theo ngày (Line Chart)
  - Lọc theo thời gian & trạng thái
  - Export CSV báo cáo chi tiết
  - Sắp xếp theo cột
- 📅 **Lịch trình Công việc**: Phân công theo thời gian và địa điểm
- 📈 **Báo cáo**: Ngày, tuần, tháng với thống kê chi tiết
- 🎨 **Dashboard**: Tổng quan trực quan với biểu đồ

#### 🚧 Đang phát triển
- 🔔 Hệ thống thông báo realtime
- 📱 Responsive mobile view
- 🖨️ In ấn báo cáo PDF
- 📦 Quản lý vật tư/kho

#### 💡 Kế hoạch tương lai
- 📸 Chụp ảnh QR code check-in tại địa điểm
- 💰 Quản lý chi phí & báo giá
- 📧 Gửi email tự động
- 📱 Mobile app (React Native)
- 🌐 Multi-language support

### 🛠️ Công nghệ Sử dụng

#### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 14+
- **ORM/Query**: node-postgres (pg)
- **File Processing**: Multer, PapaCSV, ExcelJS

#### Frontend
- **Framework**: React 18
- **UI Library**: Ant Design 5
- **Routing**: React Router v6
- **Charts**: Recharts, Chart.js
- **HTTP Client**: Axios
- **Desktop**: Electron 28

#### DevOps
- **Package Manager**: npm
- **Process Manager**: PM2 (production)
- **Version Control**: Git

### 📊 Cấu trúc Dự án
production-management/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── routes/
│   │   ├── projects.js
│   │   ├── customers.js
│   │   ├── employees.js
│   │   ├── tasks.js
│   │   ├── task-actions.js
│   │   ├── schedules.js
│   │   ├── reports.js
│   │   └── dashboard.js
│   ├── middleware/
│   │   └── errorHandler.js
│   ├── utils/
│   │   ├── codeGenerator.js
│   │   └── excelExport.js
│   ├── migrations/
│   │   ├── 001_add_tasks_system.sql
│   │   ├── 002_add_soft_delete.sql
│   │   ├── 003_create_system_logs.sql
│   │   └── 004_add_task_pause.sql
│   ├── uploads/
│   ├── database.sql
│   ├── server.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── public/
│   │   ├── electron.js
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── TaskReportTab.js
│   │   │   └── EditableLocationTable.js
│   │   ├── layouts/
│   │   │   └── MainLayout.js
│   │   ├── pages/
│   │   │   ├── Dashboard.js
│   │   │   ├── ProjectList.js
│   │   │   ├── ProjectDetail.js
│   │   │   ├── CustomerList.js
│   │   │   ├── EmployeeList.js
│   │   │   ├── TaskList.js
│   │   │   ├── TaskDetail.js
│   │   │   ├── ScheduleList.js
│   │   │   ├── ReportDaily.js
│   │   │   ├── ReportWeekly.js
│   │   │   └── ReportMonthly.js
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── supabaseService.js
│   │   ├── utils/
│   │   │   └── constants.js
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   ├── package.json
│   └── .env
├── docs/
│   ├── INSTALLATION.md
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT_ROADMAP.md
│   ├── API_DOCUMENTATION.md
│   └── USER_GUIDE.md
├── scripts/
│   ├── setup-unix.sh
│   ├── setup-windows.bat
│   ├── start-all-unix.sh
│   ├── start-all-windows.bat
│   └── backup-database.sh
└── README.md

### 🚀 Quick Start

#### Yêu cầu hệ thống
- Node.js >= 18.0.0
- PostgreSQL >= 14.0
- macOS 10.15+ / Windows 10+ / Linux
- 4GB RAM (khuyến nghị)
- 2GB ổ đĩa trống

#### Cài đặt nhanh (macOS/Linux)

# Clone repository
git clone <repository-url>
cd production-management

# Chạy script tự động
chmod +x scripts/setup-unix.sh
./scripts/setup-unix.sh

# Khởi động ứng dụng
./scripts/start-all-unix.sh

#### Cài đặt nhanh (Windows)

# Clone repository
git clone <repository-url>
cd production-management

# Chạy script tự động
scripts\setup-windows.bat

# Khởi động ứng dụng
scripts\start-all-windows.bat

📖 Xem hướng dẫn chi tiết: INSTALLATION.md
📱 Sử dụng
Sau khi cài đặt thành công:

Truy cập Web App: http://localhost:3001
Backend API: http://localhost:3000
Hoặc mở Desktop App: npm run electron (trong thư mục frontend)

Tài khoản mặc định:

Username: admin
Password: admin123

📖 Xem hướng dẫn sử dụng: USER_GUIDE.md
🤝 Đóng góp
Dự án này đang trong giai đoạn phát triển. Mọi đóng góp đều được chào đón!
📞 Liên hệ

Email: chung.lhuynh@gmail.com
GitHub Issues: [Link]

📄 License
MIT License - Xem file LICENSE để biết thêm chi tiết.
📚 Tài liệu

Hướng dẫn Cài đặt
Kiến trúc Hệ thống
Lộ trình Phát triển
API Documentation
Hướng dẫn Sử dụng


Version: 1.0.0 (Beta)
Last Updated: 2024-01-XX
Status: 🚧 Active Development
