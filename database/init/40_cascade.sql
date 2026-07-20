-- Ensure proper CASCADE on delete
ALTER TABLE task_assignments 
  DROP CONSTRAINT IF EXISTS task_assignments_task_id_fkey;

ALTER TABLE task_assignments
  ADD CONSTRAINT task_assignments_task_id_fkey 
  FOREIGN KEY (task_id) 
  REFERENCES tasks(id) 
  ON DELETE CASCADE;  -- ✅ Auto delete assignments when task deleted

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_id_fkey 
  FOREIGN KEY (project_id) 
  REFERENCES projects(id) 
  ON DELETE CASCADE;  -- ✅ Auto delete tasks when project deleted

-- Function to cleanup orphaned data
CREATE OR REPLACE FUNCTION cleanup_orphaned_assignments()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete assignments for deleted/non-existent tasks
  DELETE FROM task_assignments ta
  WHERE NOT EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = ta.task_id
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Delete assignments for deleted/non-existent projects
  DELETE FROM task_assignments ta
  USING tasks t
  WHERE ta.task_id = t.id
    AND NOT EXISTS (
      SELECT 1 FROM projects p WHERE p.id = t.project_id
    );
  
  GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Run cleanup immediately
SELECT cleanup_orphaned_assignments();

-- Create view for employee availability (excluding deleted projects/tasks)
CREATE OR REPLACE VIEW v_employee_real_workload AS
SELECT 
    e.id as employee_id,
    e.employee_code,
    e.full_name,
    e.department,
    e.position,
    e.phone,
    COUNT(DISTINCT t.id) FILTER (
        WHERE t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
        AND p.deleted_at IS NULL
        AND ta.is_active = TRUE
    ) as active_tasks,
    COUNT(DISTINCT tl.id) FILTER (
        WHERE tl.status = 'Đang lắp đặt'
        AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
        AND p.deleted_at IS NULL
    ) as active_locations,
    COALESCE(SUM(tl.estimated_hours) FILTER (
        WHERE tl.status = 'Đang lắp đặt'
        AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
        AND p.deleted_at IS NULL
    ), 0) as total_busy_hours
FROM employees e
LEFT JOIN task_assignments ta ON e.id = ta.employee_id
LEFT JOIN tasks t ON ta.task_id = t.id
LEFT JOIN projects p ON t.project_id = p.id
LEFT JOIN task_location_assignments tla ON e.id = tla.employee_id
LEFT JOIN task_locations tl ON tla.task_location_id = tl.id AND tl.task_id = t.id
WHERE e.status = 'Hoạt động'
GROUP BY e.id, e.employee_code, e.full_name, e.department, e.position, e.phone;

COMMENT ON VIEW v_employee_real_workload IS 'Employee workload excluding deleted projects and paused/cancelled tasks';