-- 1. Kiểm tra tasks đã xóa
SELECT id, task_code, task_name, status, deleted_at, is_paused
FROM tasks 
WHERE deleted_at IS NOT NULL OR status IN ('Hủy', 'Tạm dừng');

-- 2. Kiểm tra task_assignments còn active của tasks đã xóa
SELECT ta.id, ta.task_id, ta.employee_id, ta.is_active, 
       t.task_name, t.status, t.deleted_at,
       e.full_name
FROM task_assignments ta
JOIN tasks t ON ta.task_id = t.id
JOIN employees e ON ta.employee_id = e.id
WHERE ta.is_active = TRUE 
  AND (t.deleted_at IS NOT NULL OR t.status IN ('Hủy', 'Tạm dừng'));

-- 3. Kiểm tra location assignments
SELECT tla.id, tla.task_location_id, tla.employee_id,
       tl.location_name, tl.status,
       t.task_name, t.status as task_status, t.deleted_at,
       e.full_name
FROM task_location_assignments tla
JOIN task_locations tl ON tla.task_location_id = tl.id
JOIN tasks t ON tl.task_id = t.id
JOIN employees e ON tla.employee_id = e.id
WHERE t.deleted_at IS NOT NULL OR t.status IN ('Hủy', 'Tạm dừng');