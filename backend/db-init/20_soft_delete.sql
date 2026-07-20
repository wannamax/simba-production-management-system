-- =============================================
-- MIGRATION: Add Soft Delete Support
-- =============================================

BEGIN;

-- Add soft delete columns to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id);

-- Add soft delete columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_by INTEGER REFERENCES users(id);

-- Add pause/cancel columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS paused_by INTEGER REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pause_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Update task status constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('Chưa bắt đầu', 'Đang thực hiện', 'Tạm dừng', 'Chờ xử lý', 'Hoàn thành', 'Lưu trữ', 'Hủy'));

-- Add status column to task_locations if not exists
ALTER TABLE task_locations ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Chưa bắt đầu';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_paused ON tasks(is_paused) WHERE is_paused = TRUE;

-- Function to auto-update assignment status when task is paused
CREATE OR REPLACE FUNCTION update_task_assignments_on_pause()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('Tạm dừng', 'Hủy', 'Hoàn thành') AND OLD.status != NEW.status THEN
        -- Deactivate all assignments when task is paused/cancelled/completed
        UPDATE task_assignments 
        SET is_active = FALSE 
        WHERE task_id = NEW.id;
    ELSIF NEW.status = 'Đang thực hiện' AND OLD.status IN ('Tạm dừng', 'Chưa bắt đầu') THEN
        -- Reactivate assignments when task resumes
        UPDATE task_assignments 
        SET is_active = TRUE 
        WHERE task_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_assignments_on_pause ON tasks;

CREATE TRIGGER trigger_update_task_assignments_on_pause
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_assignments_on_pause();

-- View: Active projects (not deleted)
CREATE OR REPLACE VIEW v_active_projects AS
SELECT * FROM projects WHERE deleted_at IS NULL;

-- View: Active tasks (not deleted)
CREATE OR REPLACE VIEW v_active_tasks AS
SELECT * FROM tasks WHERE deleted_at IS NULL;

-- View: Employee active workload (excluding paused/cancelled tasks)
CREATE OR REPLACE VIEW v_employee_active_workload AS
SELECT 
    e.id as employee_id,
    e.employee_code,
    e.full_name,
    e.department,
    e.position,
    COUNT(DISTINCT ta.task_id) FILTER (
        WHERE t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
    ) as active_tasks,
    COUNT(DISTINCT tla.task_location_id) FILTER (
        WHERE tl.status = 'Đang lắp đặt'
        AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Lưu trữ')
    ) as active_locations,
    SUM(tl.estimated_hours) FILTER (
        WHERE tl.status = 'Đang lắp đặt'
        AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Lưu trữ')
    ) as estimated_busy_hours
FROM employees e
LEFT JOIN task_assignments ta ON e.id = ta.employee_id 
    AND ta.is_active = TRUE
LEFT JOIN tasks t ON ta.task_id = t.id 
    AND t.deleted_at IS NULL
LEFT JOIN task_location_assignments tla ON e.id = tla.employee_id
LEFT JOIN task_locations tl ON tla.task_location_id = tl.id
WHERE e.status = 'Hoạt động'
GROUP BY e.id, e.employee_code, e.full_name, e.department, e.position;

COMMIT;

-- Success message
SELECT 'Migration 002 completed successfully!' as message;