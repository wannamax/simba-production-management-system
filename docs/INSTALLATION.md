---

## 📄 2. INSTALLATION.md

```markdown
# 📦 HƯỚNG DẪN CÀI ĐẶT CHI TIẾT

## Production Management System - Installation Guide

---

## 📋 Mục lục

1. [Yêu cầu Hệ thống](#yêu-cầu-hệ-thống)
2. [Cài đặt trên macOS](#cài-đặt-trên-macos)
3. [Cài đặt trên Windows](#cài-đặt-trên-windows)
4. [Cài đặt trên Linux](#cài-đặt-trên-linux)
5. [Cấu hình Database](#cấu-hình-database)
6. [Khởi chạy Ứng dụng](#khởi-chạy-ứng-dụng)
7. [Xử lý Lỗi Thường gặp](#xử-lý-lỗi-thường-gặp)

---

## 🖥️ Yêu cầu Hệ thống

### Phần cứng Tối thiểu
- **CPU**: Intel Core i3 hoặc tương đương
- **RAM**: 4GB (khuyến nghị 8GB)
- **Ổ cứng**: 2GB trống
- **Màn hình**: 1280x720 trở lên

### Phần mềm Bắt buộc
- **Node.js**: >= 18.0.0 (LTS)
- **PostgreSQL**: >= 14.0
- **npm**: >= 9.0.0 (đi kèm Node.js)
- **Git**: >= 2.30.0

### Hệ điều hành Hỗ trợ
- ✅ macOS 10.15 (Catalina) trở lên
- ✅ Windows 10/11 (64-bit)
- ✅ Ubuntu 20.04 LTS trở lên
- ✅ Debian 11 trở lên

---

## 🍎 Cài Đặt Trên Macos

### Bước 1: Cài đặt Homebrew (nếu chưa có)

# Mở Terminal (Command + Space, gõ "Terminal")
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Kiểm tra cài đặt
brew --version

### Bước 2: Cài đặt Node.js

# Cài Node.js LTS
brew install node@18

# Kiểm tra version
node --version  # Phải >= 18.0.0
npm --version   # Phải >= 9.0.0

### Bước 3: Cài đặt PostgreSQL

# Cài PostgreSQL
brew install postgresql@14

# Khởi động PostgreSQL
brew services start postgresql@14

# Kiểm tra kết nối
psql postgres

# Trong psql prompt, gõ:
\q  # để thoát

### Bước 4: Tạo Database

# Tạo database
createdb production_management

# Hoặc dùng psql
psql postgres

### Bước 5: Clone Project

# Di chuyển đến thư mục làm việc
cd ~/Documents

# Clone repository (thay <repository-url> bằng link thực tế)
git clone <repository-url>
cd production-management

# Hoặc nếu có file ZIP
unzip production-management.zip
cd production-management

### Bước 6: Setup Backend
cd backend

# Cài đặt dependencies
npm install

# Copy file cấu hình
cp .env.example .env

# Chỉnh sửa .env
nano .env

#Nội dung file .env: 

PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=production_management
DB_USER=postgres
DB_PASSWORD=

JWT_SECRET=your-secret-key-change-this

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

### Bước 7: Import Database Schema

# Vẫn trong thư mục backend
psql -d production_management -f database.sql

# Chạy migrations
psql -d production_management -f migrations/001_add_tasks_system.sql
psql -d production_management -f migrations/002_add_soft_delete.sql
psql -d production_management -f migrations/003_create_system_logs.sql
psql -d production_management -f migrations/004_add_task_pause.sql

# Kiểm tra tables đã tạo
psql -d production_management -c "\dt"

### Bước 8: Setup Frontend

# Quay lại thư mục gốc
cd ..
cd frontend

# Cài đặt dependencies
npm install

# Copy file cấu hình
cp .env.example .env

# Chỉnh sửa .env
nano .env

### Bước 9: Khởi động Ứng dụng

#Terminal 1 backend
cd backend
npm start

# Chờ thấy:
# ✅ Database connected successfully
# 🚀 Server running on port 3000

#Terminal 2 Frontend
cd frontend
npm start

# Trình duyệt sẽ tự động mở: http://localhost:3001


### Bước 10: Chạy Desktop App (Optional)

# Trong terminal frontend
npm run electron-dev

# Hoặc build app
npm run electron-build
# File .app sẽ ở: frontend/dist/mac/


///////////////

## 🪟 Cài đặt trên Windows

### Bước 1: Cài đặt Node.js

Truy cập: https://nodejs.org/
Download bản LTS (18.x.x)
Chạy file installer .msi
Click "Next" → "Next" → "Install"
Khởi động lại máy

Kiểm tra:
# Mở Command Prompt (Win + R, gõ "cmd")
node --version
npm --version

### Bước 2: Cài đặt Node.js

Truy cập: https://www.postgresql.org/download/windows/
Download PostgreSQL 14 Installer
Chạy installer
Quan trọng: Ghi nhớ password bạn đặt cho user postgres
Port mặc định: 5432
Hoàn tất cài đặt

Kiểm tra:
# Mở SQL Shell (psql) từ Start Menu
# Nhấn Enter cho các giá trị mặc định
# Nhập password bạn đã đặt

# Trong psql:
\l
\q

### Bước 3: Cài đặt Git (nếu chưa có)
Truy cập: https://git-scm.com/download/win
Download và cài đặt
Giữ các tùy chọn mặc định

### Bước 4: Tạo Database

# Mở Command Prompt
# Tạo database (thay YOUR_PASSWORD)
"C:\Program Files\PostgreSQL\14\bin\createdb" -U postgres production_management

# Hoặc dùng SQL Shell (psql)
CREATE DATABASE production_management;

### Bước 5: Cài đặt Git (nếu chưa có)

Nếu có Git:
cd C:\Users\%USERNAME%\Documents
git clone <repository-url>
cd production-management

Nếu có file ZIP:
Giải nén vào C:\Users\YourName\Documents\
Mở Command Prompt:
cd C:\Users\%USERNAME%\Documents\production-management


### Bước 5: Clone/Extract Project
Nếu có Git
cd C:\Users\%USERNAME%\Documents
git clone <repository-url>
cd production-management

Néu có Zip
Giải nén vào C:\Users\YourName\Documents\
Mở Command Prompt:
cd C:\Users\%USERNAME%\Documents\production-management

### Bước 6: Setup Backend
cd backend

# Cài đặt
npm install

# Copy file cấu hình
copy .env.example .env

# Mở file để chỉnh sửa
notepad .env

Sửa file .evn

PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=production_management
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE

JWT_SECRET=your-secret-key-change-this

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

Lưu file: Ctrl + S, đóng Notepad

### Bước 7: Import Database

# Vẫn trong thư mục backend
"C:\Program Files\PostgreSQL\14\bin\psql" -U postgres -d production_management -f database.sql

# Nhập password khi được hỏi

# Import migrations
"C:\Program Files\PostgreSQL\14\bin\psql" -U postgres -d production_management -f migrations\001_add_tasks_system.sql
"C:\Program Files\PostgreSQL\14\bin\psql" -U postgres -d production_management -f migrations\002_add_soft_delete.sql
"C:\Program Files\PostgreSQL\14\bin\psql" -U postgres -d production_management -f migrations\003_create_system_logs.sql
"C:\Program Files\PostgreSQL\14\bin\psql" -U postgres -d production_management -f migrations\004_add_task_pause.sql

### Bước 8: Setup Frontend

# Quay lại thư mục gốc
cd ..
cd frontend

# Cài đặt
npm install

# Copy và sửa .env
copy .env.example .env
notepad .env

Nội dung .env:
REACT_APP_API_URL=http://localhost:3000/api


### Bước 9: Khởi động


Command Prompt 1 - Backend:
cd backend
npm start

Command Prompt 2 - Frontend:
cd frontend
npm start

Hoặc dùng Script tự động:
# Trong thư mục gốc
scripts\start-all-windows.bat


### Bước 10: Build Desktop App

cd frontend

# Development
npm run electron-dev

# Build production
npm run electron-build

# File .exe sẽ ở: frontend\dist\

----------


🐧 Cài đặt trên Linux (Ubuntu/Debian)

Bước 1: Update System
sudo apt update
sudo apt upgrade -y

Bước 2: Cài đặt Node.js
# Cài Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Kiểm tra
node --version
npm --version
Bước 3: Cài đặt PostgreSQL

# Cài PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Khởi động service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Kiểm tra status
sudo systemctl status postgresql
Bước 4: Tạo Database & User

# Chuyển sang user postgres
sudo -i -u postgres

# Vào psql
psql

# Trong psql:
CREATE DATABASE production_management;
CREATE USER pmuser WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE production_management TO pmuser;
\q

# Thoát user postgres
exit
Bước 5: Clone Project
bashCopycd ~
git clone <repository-url>
cd production-management
Bước 6-9: Giống như macOS
bashCopy# Backend
cd backend
npm install
cp .env.example .env
nano .env  # Sửa thông tin database

# Import database
psql -U pmuser -d production_management -f database.sql
psql -U pmuser -d production_management -f migrations/*.sql

# Frontend
cd ../frontend
npm install
cp .env.example .env
nano .env

# Khởi động
cd ../backend && npm start &
cd ../frontend && npm start

🔧 Cấu hình Database Chi tiết
Tạo User và Phân quyền
sqlCopy-- Kết nối PostgreSQL
psql postgres

-- Tạo user mới (thay password)
CREATE USER pmadmin WITH PASSWORD 'StrongPassword123!';

-- Tạo database
CREATE DATABASE production_management OWNER pmadmin;

-- Grant quyền
GRANT ALL PRIVILEGES ON DATABASE production_management TO pmadmin;

-- Kết nối database
\c production_management

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO pmadmin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pmadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pmadmin;

\q
Verify Database
bashCopy# Test connection
psql -U pmadmin -d production_management -c "SELECT version();"

# Liệt kê tables
psql -U pmadmin -d production_management -c "\dt"

# Kiểm tra data mẫu
psql -U pmadmin -d production_management -c "SELECT * FROM projects LIMIT 5;"

🚀 Khởi chạy Ứng dụng
Development Mode
Cách 1: Manual (2 terminals)
bashCopy# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend
cd frontend
npm start
Cách 2: Script tự động
macOS/Linux:
bashCopychmod +x scripts/start-all-unix.sh
./scripts/start-all-unix.sh
Windows:
cmdCopyscripts\start-all-windows.bat
Production Mode (PM2)
bashCopy# Cài đặt PM2
npm install -g pm2

# Start backend
cd backend
pm2 start server.js --name "production-backend"

# Start frontend (build trước)
cd ../frontend
npm run build
pm2 serve build 3001 --name "production-frontend" --spa

# Quản lý
pm2 list
pm2Add to Conversation




