psql -d production_management << 'EOF'
-- Add missing columns if not exist
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pause_reason TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Update status constraint to include new statuses
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('Chưa bắt đầu', 'Đang thực hiện', 'Tạm dừng', 'Chờ xử lý', 'Hoàn thành', 'Lưu trữ', 'Hủy'));

-- Create trigger function for auto-deactivate assignments
CREATE OR REPLACE FUNCTION update_task_assignments_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When task is paused, cancelled, or completed
    IF NEW.status IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ') 
       AND OLD.status != NEW.status THEN
        UPDATE task_assignments 
        SET is_active = FALSE 
        WHERE task_id = NEW.id;
        
        RAISE NOTICE 'Deactivated assignments for task %', NEW.id;
    END IF;
    
    -- When task is resumed from pause
    IF NEW.status = 'Đang thực hiện' 
       AND OLD.status IN ('Tạm dừng', 'Chưa bắt đầu') THEN
        UPDATE task_assignments 
        SET is_active = TRUE 
        WHERE task_id = NEW.id;
        
        RAISE NOTICE 'Reactivated assignments for task %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trigger_update_task_assignments_on_pause ON tasks;

-- Create new trigger
CREATE TRIGGER trigger_update_task_assignments_on_status_change
    AFTER UPDATE OF status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_task_assignments_on_status_change();

-- Verify trigger
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trigger_update_task_assignments_on_status_change';

COMMIT;
EOF