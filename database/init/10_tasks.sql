-- =============================================
-- MIGRATION: Add Tasks Management System
-- Run: psql -d production_management -f backend/migrations/001_add_tasks_system.sql
-- =============================================

\echo 'Starting Tasks System Migration...'

-- =============================================
-- 1. TASKS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    task_code VARCHAR(50) UNIQUE NOT NULL,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL, -- 'Sản xuất', 'Giao hàng', 'Lắp đặt'
    task_name VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Timing
    start_date DATE,
    end_date DATE,
    estimated_duration INTEGER, -- Số ngày dự kiến
    estimated_hours DECIMAL(10,2), -- Tổng số giờ dự kiến
    actual_start_date DATE,
    actual_end_date DATE,
    actual_duration INTEGER, -- Số ngày thực tế
    actual_hours DECIMAL(10,2), -- Tổng số giờ thực tế
    
    -- Status and Progress
    status VARCHAR(50) DEFAULT 'Chưa bắt đầu',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    priority VARCHAR(20) DEFAULT 'Trung bình',
    
    -- Completion
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    completed_by INTEGER,
    
    -- Archive
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMP,
    archived_by INTEGER,
    
    -- Notifications
    notify_before_days INTEGER DEFAULT 1,
    is_overdue BOOLEAN DEFAULT FALSE,
    overdue_notified BOOLEAN DEFAULT FALSE,
    
    -- Statistics
    total_locations INTEGER DEFAULT 0,
    completed_locations INTEGER DEFAULT 0,
    total_assigned_employees INTEGER DEFAULT 0,
    
    -- Metadata
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

\echo 'Created table: tasks'

-- =============================================
-- 2. TASK LOCATIONS (For Installation Tasks)
-- =============================================
CREATE TABLE IF NOT EXISTS task_locations (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Location Info
    location_name VARCHAR(200) NOT NULL,
    location_address TEXT NOT NULL,
    location_city VARCHAR(100),
    location_district VARCHAR(100),
    location_ward VARCHAR(100),
    
    -- Contact Info
    contact_person VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    
    -- Installation Details
    installation_date DATE,
    installation_time_start TIME,
    installation_time_end TIME,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    
    -- Status
    status VARCHAR(50) DEFAULT 'Chưa bắt đầu',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    
    -- Completion
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    
    -- Product/Work Info
    product_info TEXT,
    work_description TEXT,
    
    -- Notes and Issues
    notes TEXT,
    issues TEXT,
    
    -- Images
    images TEXT[],
    
    -- GPS Coordinates
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    
    -- Order
    display_order INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

\echo 'Created table: task_locations'

-- =============================================
-- 3. TASK ASSIGNMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS task_assignments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Role in Task
    role_in_task VARCHAR(100),
    
    -- Assignment Details
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by INTEGER,
    start_date DATE,
    end_date DATE,
    
    -- Work Tracking
    total_hours DECIMAL(10,2) DEFAULT 0,
    total_locations INTEGER DEFAULT 0,
    completed_locations INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Notes
    notes TEXT,
    
    -- Unique constraint
    UNIQUE(task_id, employee_id)
);

\echo 'Created table: task_assignments'

-- =============================================
-- 4. TASK LOCATION ASSIGNMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS task_location_assignments (
    id SERIAL PRIMARY KEY,
    task_location_id INTEGER NOT NULL REFERENCES task_locations(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    task_assignment_id INTEGER REFERENCES task_assignments(id) ON DELETE CASCADE,
    
    -- Role at this location
    role VARCHAR(100),
    
    -- Check-in/Check-out
    check_in_time TIMESTAMP,
    check_out_time TIMESTAMP,
    
    -- Work hours at this location
    work_hours DECIMAL(5,2),
    
    -- Notes
    notes TEXT,
    
    -- Unique constraint
    UNIQUE(task_location_id, employee_id)
);

\echo 'Created table: task_location_assignments'

-- =============================================
-- 5. TASK REPORTS
-- =============================================
CREATE TABLE IF NOT EXISTS task_reports (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    task_location_id INTEGER REFERENCES task_locations(id) ON DELETE SET NULL,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    
    -- Report Info
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    report_title VARCHAR(200),
    work_done TEXT NOT NULL,
    issues TEXT,
    solutions TEXT,
    next_plan TEXT,
    
    -- Work Details
    work_hours DECIMAL(5,2),
    progress_update INTEGER CHECK (progress_update >= 0 AND progress_update <= 100),
    quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
    
    -- Media
    images TEXT[],
    documents TEXT[],
    
    -- Status
    report_status VARCHAR(50) DEFAULT 'Đã gửi',
    
    -- Approval
    approved_by INTEGER,
    approved_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

\echo 'Created table: task_reports'

-- =============================================
-- 6. TASK NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS task_notifications (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    
    -- Notification Type
    notification_type VARCHAR(50) NOT NULL,
    
    -- Message
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    
    -- Recipients
    recipient_user_ids INTEGER[],
    recipient_employee_ids INTEGER[],
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    
    -- Priority
    priority VARCHAR(20) DEFAULT 'Normal',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW()
);

\echo 'Created table: task_notifications'

-- =============================================
-- 7. UPDATE PROJECT_ASSIGNMENTS
-- =============================================
ALTER TABLE project_assignments ADD COLUMN IF NOT EXISTS is_available_for_tasks BOOLEAN DEFAULT TRUE;
ALTER TABLE project_assignments ADD COLUMN IF NOT EXISTS skills TEXT[];

\echo 'Updated table: project_assignments'

-- =============================================
-- 8. INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tasks(is_overdue) WHERE is_overdue = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(is_archived);

CREATE INDEX IF NOT EXISTS idx_task_locations_task ON task_locations(task_id);
CREATE INDEX IF NOT EXISTS idx_task_locations_status ON task_locations(status);
CREATE INDEX IF NOT EXISTS idx_task_locations_date ON task_locations(installation_date);

CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_employee ON task_assignments(employee_id);

CREATE INDEX IF NOT EXISTS idx_task_location_assignments_location ON task_location_assignments(task_location_id);
CREATE INDEX IF NOT EXISTS idx_task_location_assignments_employee ON task_location_assignments(employee_id);

CREATE INDEX IF NOT EXISTS idx_task_reports_task ON task_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_task_reports_date ON task_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_task_reports_employee ON task_reports(employee_id);

CREATE INDEX IF NOT EXISTS idx_task_notifications_task ON task_notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_task_notifications_unread ON task_notifications(is_read) WHERE is_read = FALSE;

\echo 'Created indexes'

-- =============================================
-- 9. TRIGGERS
-- =============================================

-- Update tasks.updated_at
CREATE OR REPLACE FUNCTION update_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tasks_updated_at ON tasks;
CREATE TRIGGER trigger_update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_updated_at();

\echo 'Created trigger: update_task_updated_at'

-- Auto-update task location statistics
CREATE OR REPLACE FUNCTION update_task_location_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tasks SET
        total_locations = (SELECT COUNT(*) FROM task_locations WHERE task_id = COALESCE(NEW.task_id, OLD.task_id)),
        completed_locations = (SELECT COUNT(*) FROM task_locations WHERE task_id = COALESCE(NEW.task_id, OLD.task_id) AND is_completed = TRUE)
    WHERE id = COALESCE(NEW.task_id, OLD.task_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_location_stats ON task_locations;
CREATE TRIGGER trigger_update_task_location_stats
    AFTER INSERT OR UPDATE OR DELETE ON task_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_task_location_stats();

\echo 'Created trigger: update_task_location_stats'

-- Auto-update task employee count
CREATE OR REPLACE FUNCTION update_task_employee_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tasks SET
        total_assigned_employees = (SELECT COUNT(*) FROM task_assignments WHERE task_id = COALESCE(NEW.task_id, OLD.task_id) AND is_active = TRUE)
    WHERE id = COALESCE(NEW.task_id, OLD.task_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_employee_count ON task_assignments;
CREATE TRIGGER trigger_update_task_employee_count
    AFTER INSERT OR UPDATE OR DELETE ON task_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_task_employee_count();

\echo 'Created trigger: update_task_employee_count'

-- =============================================
-- 10. VIEWS
-- =============================================

-- View: Task Overview
CREATE OR REPLACE VIEW v_task_overview AS
SELECT 
    t.*,
    p.project_name,
    p.project_code,
    p.customer_id,
    c.company_name as customer_name,
    CASE 
        WHEN t.total_locations > 0 THEN 
            ROUND((t.completed_locations::DECIMAL / t.total_locations) * 100, 2)
        ELSE 0 
    END as location_completion_percentage
FROM tasks t
JOIN projects p ON t.project_id = p.id
LEFT JOIN customers c ON p.customer_id = c.id;

\echo 'Created view: v_task_overview'

-- =============================================
-- 11. SAMPLE DATA (Optional)
-- =============================================

-- Insert sample task if project exists
DO $$
DECLARE
    sample_project_id INTEGER;
BEGIN
    SELECT id INTO sample_project_id FROM projects LIMIT 1;
    
    IF sample_project_id IS NOT NULL THEN
        INSERT INTO tasks (
            task_code, 
            project_id, 
            task_type, 
            task_name, 
            description, 
            start_date, 
            end_date, 
            estimated_hours, 
            priority
        )
        VALUES (
            'INS-' || TO_CHAR(NOW(), 'YYYY') || '0001',
            sample_project_id,
            'Lắp đặt',
            'Lắp đặt bảng hiệu tại các chi nhánh',
            'Lắp đặt bảng hiệu LED tại 5 chi nhánh trong TP.HCM',
            CURRENT_DATE,
            CURRENT_DATE + INTERVAL '7 days',
            40.0,
            'Cao'
        )
        ON CONFLICT (task_code) DO NOTHING;
    END IF;
END $$;

-- =============================================
-- MIGRATION COMPLETED
-- =============================================
\echo ''
\echo '✅ Tasks System Migration Completed Successfully!'
\echo ''
\echo 'Run these commands to verify:'
\echo '  psql -d production_management -c "\dt task*"'
\echo '  psql -d production_management -c "SELECT * FROM tasks LIMIT 1;"'
\echo ''