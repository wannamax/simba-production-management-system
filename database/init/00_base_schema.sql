-- =============================================
-- PRODUCTION MANAGEMENT DATABASE - COMPLETE VERSION
-- Drop all tables and recreate from scratch
-- =============================================

-- Drop tables in correct order (respect foreign keys)
DROP TABLE IF EXISTS material_usage CASCADE;
DROP TABLE IF EXISTS materials CASCADE;
DROP TABLE IF EXISTS work_reports CASCADE;
DROP TABLE IF EXISTS schedule_assignments CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS project_products CASCADE;
DROP TABLE IF EXISTS project_assignments CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =============================================
-- 1. USERS TABLE
-- =============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 2. CUSTOMERS TABLE
-- =============================================
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(50) UNIQUE NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    district VARCHAR(100),
    tax_code VARCHAR(50),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 3. EMPLOYEES TABLE
-- =============================================
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    position VARCHAR(100),
    department VARCHAR(100),
    salary DECIMAL(15,2),
    hire_date DATE,
    status VARCHAR(20) DEFAULT 'Hoạt động',
    avatar_url TEXT,
    address TEXT,
    id_number VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 4. PROJECTS TABLE
-- =============================================
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    project_code VARCHAR(50) UNIQUE NOT NULL,
    project_name VARCHAR(200) NOT NULL,
    project_type VARCHAR(50),
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    start_date DATE,
    end_date DATE,
    actual_end_date DATE,
    status VARCHAR(50) DEFAULT 'Mới tạo',
    priority VARCHAR(20) DEFAULT 'Trung bình',
    budget DECIMAL(15,2),
    actual_cost DECIMAL(15,2),
    payment_status VARCHAR(50) DEFAULT 'Chưa thanh toán',
    deposit_amount DECIMAL(15,2),
    description TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 5. PROJECT ASSIGNMENTS TABLE
-- =============================================
CREATE TABLE project_assignments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(100),
    assigned_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, employee_id, role)
);

-- =============================================
-- 6. PROJECT PRODUCTS TABLE
-- =============================================
CREATE TABLE project_products (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    product_type VARCHAR(100),
    product_name VARCHAR(200) NOT NULL,
    specifications TEXT,
    quantity INTEGER DEFAULT 1,
    unit VARCHAR(50) DEFAULT 'Cái',
    unit_price DECIMAL(15,2),
    total_price DECIMAL(15,2),
    production_status VARCHAR(50) DEFAULT 'Chưa sản xuất',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 7. SCHEDULES TABLE
-- =============================================
CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    schedule_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    location TEXT,
    location_address TEXT,
    location_contact VARCHAR(100),
    location_phone VARCHAR(20),
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'Chưa bắt đầu',
    priority VARCHAR(20) DEFAULT 'Trung bình',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 8. SCHEDULE ASSIGNMENTS TABLE
-- =============================================
CREATE TABLE schedule_assignments (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    role_in_schedule VARCHAR(100),
    assigned_at TIMESTAMP DEFAULT NOW(),
    check_in_time TIMESTAMP,
    check_out_time TIMESTAMP,
    notes TEXT,
    UNIQUE(schedule_id, employee_id)
);

-- =============================================
-- 9. WORK REPORTS TABLE
-- =============================================
CREATE TABLE work_reports (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    report_type VARCHAR(20) NOT NULL,
    title VARCHAR(200),
    work_done TEXT NOT NULL,
    issues TEXT,
    solutions TEXT,
    images TEXT[],
    work_hours DECIMAL(5,2),
    progress_update INTEGER CHECK (progress_update >= 0 AND progress_update <= 100),
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 10. MATERIALS TABLE
-- =============================================
CREATE TABLE materials (
    id SERIAL PRIMARY KEY,
    material_code VARCHAR(50) UNIQUE NOT NULL,
    material_name VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    unit VARCHAR(50),
    quantity_in_stock DECIMAL(10,2) DEFAULT 0,
    min_stock_level DECIMAL(10,2),
    unit_price DECIMAL(15,2),
    supplier VARCHAR(200),
    supplier_phone VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 11. MATERIAL USAGE TABLE
-- =============================================
CREATE TABLE material_usage (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    schedule_id INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
    material_id INTEGER REFERENCES materials(id) ON DELETE CASCADE,
    quantity_used DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(15,2),
    total_cost DECIMAL(15,2),
    used_date DATE DEFAULT CURRENT_DATE,
    used_by INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 12. SYSTEM SETTINGS TABLE
-- =============================================
CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50),
    description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_customer ON projects(customer_id);
CREATE INDEX idx_projects_dates ON projects(start_date, end_date);
CREATE INDEX idx_projects_priority ON projects(priority);
CREATE INDEX idx_schedules_dates ON schedules(start_datetime, end_datetime);
CREATE INDEX idx_schedules_project ON schedules(project_id);
CREATE INDEX idx_schedules_status ON schedules(status);
CREATE INDEX idx_work_reports_date ON work_reports(report_date);
CREATE INDEX idx_work_reports_project ON work_reports(project_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_materials_stock ON materials(quantity_in_stock);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at 
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at 
    BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employees_updated_at 
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at 
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_materials_updated_at 
    BEFORE UPDATE ON materials
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_reports_updated_at 
    BEFORE UPDATE ON work_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- SAMPLE DATA
-- =============================================

-- Insert default admin user
INSERT INTO users (username, password_hash, full_name, email, role) VALUES
('admin', '$2b$10$XqNvMJ2G3xEKE6vLJZhP4.PpGYwL0MjLqD8DZF3DyKQY5eZ3H0EqS', 'Administrator', 'admin@company.com', 'admin');

-- Insert sample customers
INSERT INTO customers (customer_code, company_name, contact_person, phone, email, address, city) VALUES
('KH00001', 'Công ty TNHH ABC Technology', 'Nguyễn Văn An', '0901234567', 'contact@abc.com', '123 Đường ABC', 'TP.HCM'),
('KH00002', 'Công ty Cổ phần XYZ Group', 'Trần Thị Bình', '0912345678', 'info@xyz.com', '456 Đường XYZ', 'Hà Nội'),
('KH00003', 'Siêu thị Điện Máy 123', 'Lê Văn Cường', '0923456789', 'shop@123.com', '789 Đường 123', 'Đà Nẵng');

-- Insert sample employees
INSERT INTO employees (employee_code, full_name, phone, position, department, salary, hire_date, status) VALUES
('NV00001', 'Nguyễn Văn Quản', '0987654321', 'Quản lý', 'Hành chính', 15000000, '2020-01-15', 'Hoạt động'),
('NV00002', 'Trần Văn Sản', '0987654322', 'Thợ sản xuất', 'Sản xuất', 10000000, '2020-03-20', 'Hoạt động'),
('NV00003', 'Lê Văn Lắp', '0987654323', 'Thợ lắp đặt', 'Lắp đặt', 10000000, '2020-05-10', 'Hoạt động'),
('NV00004', 'Phạm Thị Kế', '0987654324', 'Thiết kế', 'Thiết kế', 12000000, '2020-02-01', 'Hoạt động'),
('NV00005', 'Hoàng Văn Phụ', '0987654325', 'Thợ phụ', 'Sản xuất', 8000000, '2021-01-10', 'Hoạt động');

-- Insert sample materials
INSERT INTO materials (material_code, material_name, category, unit, quantity_in_stock, min_stock_level, unit_price) VALUES
('VT00001', 'Nhôm định hình 50x50', 'Alu', 'm', 100.00, 20.00, 45000),
('VT00002', 'Mica trong 3mm', 'Mica', 'm2', 50.00, 10.00, 120000),
('VT00003', 'Inox 304 dày 1mm', 'Inox', 'm2', 30.00, 5.00, 250000),
('VT00004', 'LED module 3 bóng', 'Điện', 'cái', 500, 100, 3500),
('VT00005', 'Sơn xịt màu trắng', 'Sơn', 'lon', 20, 5, 85000);

-- Insert sample project
INSERT INTO projects (project_code, project_name, project_type, customer_id, start_date, end_date, status, priority, budget, description) VALUES
('PRJ-202400001', 'Bảng hiệu siêu thị ABC', 'Bảng hiệu', 1, '2024-01-15', '2024-02-15', 'Đang sản xuất', 'Cao', 50000000, 'Bảng hiệu chữ nổi Inox gương kích thước 8m x 1.5m');

-- Insert project products
INSERT INTO project_products (project_id, product_type, product_name, specifications, quantity, unit, unit_price, total_price) VALUES
(1, 'Bảng hiệu', 'Chữ nổi Inox 304', 'Kích thước: 8m x 1.5m, Chất liệu: Inox gương 304, Đèn LED bên trong', 1, 'bộ', 50000000, 50000000);

-- Insert project assignments
INSERT INTO project_assignments (project_id, employee_id, role, assigned_date) VALUES
(1, 1, 'Quản lý dự án', '2024-01-15'),
(1, 2, 'Trưởng nhóm sản xuất', '2024-01-15'),
(1, 3, 'Trưởng nhóm lắp đặt', '2024-01-15'),
(1, 4, 'Thiết kế', '2024-01-15');

-- Insert sample schedules
INSERT INTO schedules (project_id, schedule_type, title, location, location_address, start_datetime, end_datetime, status, priority, progress) VALUES
(1, 'Khảo sát', 'Khảo sát địa điểm lắp đặt', 'Siêu thị ABC', '123 Đường ABC, TP.HCM', '2024-01-15 08:00:00', '2024-01-15 12:00:00', 'Hoàn thành', 'Cao', 100),
(1, 'Thiết kế', 'Thiết kế chi tiết bảng hiệu', 'Văn phòng', 'VP công ty', '2024-01-16 08:00:00', '2024-01-20 17:00:00', 'Hoàn thành', 'Cao', 100),
(1, 'Sản xuất', 'Sản xuất chữ nổi Inox', 'Xưởng sản xuất', 'Xưởng số 1', '2024-01-22 07:00:00', '2024-02-05 17:00:00', 'Đang thực hiện', 'Cao', 65),
(1, 'Lắp đặt', 'Lắp đặt bảng hiệu tại hiện trường', 'Siêu thị ABC', '123 Đường ABC, TP.HCM', '2024-02-10 06:00:00', '2024-02-12 18:00:00', 'Chưa bắt đầu', 'Cao', 0);

-- Insert schedule assignments
INSERT INTO schedule_assignments (schedule_id, employee_id, role_in_schedule) VALUES
(1, 1, 'Giám sát'),
(1, 4, 'Thiết kế'),
(2, 4, 'Thiết kế chính'),
(3, 2, 'Trưởng nhóm'),
(3, 5, 'Thợ phụ'),
(4, 3, 'Trưởng nhóm'),
(4, 5, 'Thợ phụ');

-- Insert sample work reports
INSERT INTO work_reports (schedule_id, project_id, employee_id, report_date, report_type, title, work_done, work_hours, progress_update) VALUES
(1, 1, 1, '2024-01-15', 'Ngày', 'Báo cáo khảo sát', 'Đã khảo sát địa điểm lắp đặt, đo đạc kích thước, chụp ảnh hiện trường', 4.0, 100),
(2, 1, 4, '2024-01-20', 'Ngày', 'Hoàn thành thiết kế', 'Đã hoàn thành bản vẽ thiết kế 3D và bản vẽ kỹ thuật chi tiết', 8.0, 100),
(3, 1, 2, '2024-01-25', 'Ngày', 'Tiến độ sản xuất', 'Đã hoàn thành khung nhôm, đang gia công chữ Inox', 8.0, 65);

-- Insert system settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, description) VALUES
('company_name', 'Công ty Sản xuất & Lắp đặt Quảng cáo', 'string', 'Tên công ty'),
('company_phone', '0123456789', 'string', 'Số điện thoại công ty'),
('company_email', 'info@company.com', 'string', 'Email công ty'),
('company_address', '123 Đường ABC, Quận 1, TP.HCM', 'string', 'Địa chỉ công ty'),
('working_hours_per_day', '8', 'number', 'Số giờ làm việc tiêu chuẩn mỗi ngày'),
('overtime_rate', '1.5', 'number', 'Hệ số lương làm thêm giờ');

-- =============================================
-- VIEWS FOR REPORTING
-- =============================================

-- View: Project Overview
CREATE OR REPLACE VIEW v_project_overview AS
SELECT 
    p.id,
    p.project_code,
    p.project_name,
    p.project_type,
    p.status,
    p.priority,
    p.start_date,
    p.end_date,
    p.budget,
    p.actual_cost,
    c.company_name as customer_name,
    c.contact_person,
    c.phone as customer_phone,
    COUNT(DISTINCT s.id) as total_schedules,
    COUNT(DISTINCT pa.employee_id) as total_assigned_employees,
    AVG(s.progress) as avg_progress
FROM projects p
LEFT JOIN customers c ON p.customer_id = c.id
LEFT JOIN schedules s ON p.id = s.project_id
LEFT JOIN project_assignments pa ON p.id = pa.project_id
GROUP BY p.id, c.company_name, c.contact_person, c.phone;

-- View: Schedule with Staff
CREATE OR REPLACE VIEW v_schedule_with_staff AS
SELECT 
    s.id,
    s.project_id,
    p.project_name,
    p.project_code,
    s.schedule_type,
    s.title,
    s.location,
    s.start_datetime,
    s.end_datetime,
    s.status,
    s.priority,
    s.progress,
    array_agg(DISTINCT e.full_name) FILTER (WHERE e.full_name IS NOT NULL) as assigned_employees,
    COUNT(DISTINCT sa.employee_id) as employee_count
FROM schedules s
JOIN projects p ON s.project_id = p.id
LEFT JOIN schedule_assignments sa ON s.id = sa.schedule_id
LEFT JOIN employees e ON sa.employee_id = e.id
GROUP BY s.id, p.project_name, p.project_code;

-- View: Work Report Details
CREATE OR REPLACE VIEW v_work_report_details AS
SELECT 
    wr.id,
    wr.report_date,
    wr.report_type,
    wr.title,
    wr.work_done,
    wr.work_hours,
    wr.progress_update,
    e.full_name as employee_name,
    e.department,
    p.project_name,
    p.project_code,
    s.title as schedule_title,
    s.schedule_type
FROM work_reports wr
JOIN employees e ON wr.employee_id = e.id
JOIN projects p ON wr.project_id = p.id
LEFT JOIN schedules s ON wr.schedule_id = s.id;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database schema created successfully!';
    RAISE NOTICE '📊 Created tables: 12';
    RAISE NOTICE '👤 Sample users: 1 (username: admin, password: admin123)';
    RAISE NOTICE '🏢 Sample customers: 3';
    RAISE NOTICE '👷 Sample employees: 5';
    RAISE NOTICE '📦 Sample materials: 5';
    RAISE NOTICE '📁 Sample project: 1 with schedules and reports';
END $$;