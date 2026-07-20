-- =============================================
-- CLEANUP ORPHANED ASSIGNMENTS
-- =============================================

BEGIN;

-- 1. Deactivate task_assignments của tasks đã xóa/hủy/tạm dừng
UPDATE task_assignments ta
SET is_active = FALSE
FROM tasks t
WHERE ta.task_id = t.id
  AND ta.is_active = TRUE
  AND (
    t.deleted_at IS NOT NULL 
    OR t.status IN ('Hủy', 'Tạm dừng', 'Hoàn thành', 'Lưu trữ')
  );

-- 2. Xóa task_location_assignments của tasks đã xóa
DELETE FROM task_location_assignments tla
USING task_locations tl, tasks t
WHERE tla.task_location_id = tl.id
  AND tl.task_id = t.id
  AND t.deleted_at IS NOT NULL;

-- 3. Update task_locations của tasks đã hủy
UPDATE task_locations tl
SET status = 'Hủy',
    notes = CONCAT(COALESCE(notes, ''), ' [Task đã hủy]')
FROM tasks t
WHERE tl.task_id = t.id
  AND t.status = 'Hủy'
  AND tl.status NOT IN ('Hoàn thành', 'Hủy');

-- 4. Deactivate project_assignments của projects đã xóa
UPDATE project_assignments pa
SET is_available_for_tasks = FALSE
FROM projects p
WHERE pa.project_id = p.id
  AND p.deleted_at IS NOT NULL;

-- 5. Count số assignments đã update
SELECT 
    'task_assignments deactivated' as action,
    COUNT(*) as count
FROM task_assignments ta
JOIN tasks t ON ta.task_id = t.id
WHERE ta.is_active = FALSE
  AND (t.deleted_at IS NOT NULL OR t.status IN ('Hủy', 'Tạm dừng'));

COMMIT;

-- Verify cleanup
SELECT 'Verification: Active assignments in deleted/cancelled tasks' as check_name;
SELECT COUNT(*) as should_be_zero
FROM task_assignments ta
JOIN tasks t ON ta.task_id = t.id
WHERE ta.is_active = TRUE 
  AND (t.deleted_at IS NOT NULL OR t.status IN ('Hủy', 'Tạm dừng', 'Lưu trữ'));