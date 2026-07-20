-- =============================================
-- AUTO DEACTIVATE TASK ASSIGNMENTS TRIGGER
-- =============================================

-- Function: Tự động deactivate assignments khi task bị xóa/tạm dừng/hủy
CREATE OR REPLACE FUNCTION auto_deactivate_task_assignments()
RETURNS TRIGGER AS $$
BEGIN
    -- Khi task bị soft delete, tạm dừng, hoặc hủy
    IF (
        (NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at))
        OR (NEW.status IN ('Hủy', 'Tạm dừng', 'Hoàn thành', 'Lưu trữ') 
            AND (OLD.status IS NULL OR OLD.status NOT IN ('Hủy', 'Tạm dừng', 'Hoàn thành', 'Lưu trữ')))
    ) THEN
        -- Deactivate all assignments
        UPDATE task_assignments 
        SET is_active = FALSE 
        WHERE task_id = NEW.id 
          AND is_active = TRUE;
        
        RAISE NOTICE '✅ Deactivated assignments for task ID: %', NEW.id;
    END IF;
    
    -- Khi task được phục hồi hoặc tiếp tục
    IF (
        (NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL)
        OR (NEW.status = 'Đang thực hiện' AND OLD.status IN ('Tạm dừng', 'Chưa bắt đầu'))
    ) THEN
        -- Reactivate assignments
        UPDATE task_assignments 
        SET is_active = TRUE 
        WHERE task_id = NEW.id 
          AND is_active = FALSE;
        
        RAISE NOTICE '✅ Reactivated assignments for task ID: %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_deactivate_task_assignments ON tasks;

-- Create trigger
CREATE TRIGGER trigger_auto_deactivate_task_assignments
    AFTER UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION auto_deactivate_task_assignments();

SELECT '✅ Trigger created successfully' as status;