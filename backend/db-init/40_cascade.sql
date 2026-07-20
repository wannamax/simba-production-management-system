-- Simba PMS 2.2.1 hotfix: cascade constraints and orphan cleanup
-- This migration is safe to run transactionally by backend/scripts/migrate.js.

-- Clean orphaned rows before enforcing foreign keys. This makes upgrades from
-- older installations safer if inconsistent rows already exist.
CREATE OR REPLACE FUNCTION cleanup_orphaned_assignments()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER := 0;
  affected_count INTEGER := 0;
BEGIN
  -- Remove assignments whose task no longer exists.
  DELETE FROM task_assignments AS ta
  WHERE NOT EXISTS (
    SELECT 1
    FROM tasks AS t
    WHERE t.id = ta.task_id
  );

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  deleted_count := deleted_count + affected_count;

  -- Remove assignments whose task references a project that no longer exists.
  DELETE FROM task_assignments AS ta
  USING tasks AS t
  WHERE ta.task_id = t.id
    AND NOT EXISTS (
      SELECT 1
      FROM projects AS p
      WHERE p.id = t.project_id
    );

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  deleted_count := deleted_count + affected_count;

  RETURN deleted_count;
END;
$$;

-- Run cleanup before replacing constraints.
SELECT cleanup_orphaned_assignments();

-- Ensure task assignments are deleted automatically with their task.
ALTER TABLE task_assignments
  DROP CONSTRAINT IF EXISTS task_assignments_task_id_fkey;

ALTER TABLE task_assignments
  ADD CONSTRAINT task_assignments_task_id_fkey
  FOREIGN KEY (task_id)
  REFERENCES tasks(id)
  ON DELETE CASCADE;

-- Ensure tasks are deleted automatically with their project.
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_project_id_fkey
  FOREIGN KEY (project_id)
  REFERENCES projects(id)
  ON DELETE CASCADE;

-- Employee workload excluding deleted projects and inactive task states.
CREATE OR REPLACE VIEW v_employee_real_workload AS
SELECT
    e.id AS employee_id,
    e.employee_code,
    e.full_name,
    e.department,
    e.position,
    e.phone,
    COUNT(DISTINCT t.id) FILTER (
        WHERE t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
          AND p.deleted_at IS NULL
          AND ta.is_active = TRUE
    ) AS active_tasks,
    COUNT(DISTINCT tl.id) FILTER (
        WHERE tl.status = 'Đang lắp đặt'
          AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
          AND p.deleted_at IS NULL
    ) AS active_locations,
    COALESCE(
      SUM(tl.estimated_hours) FILTER (
          WHERE tl.status = 'Đang lắp đặt'
            AND t.status NOT IN ('Tạm dừng', 'Hủy', 'Hoàn thành', 'Lưu trữ')
            AND p.deleted_at IS NULL
      ),
      0
    ) AS total_busy_hours
FROM employees AS e
LEFT JOIN task_assignments AS ta
  ON e.id = ta.employee_id
LEFT JOIN tasks AS t
  ON ta.task_id = t.id
LEFT JOIN projects AS p
  ON t.project_id = p.id
LEFT JOIN task_location_assignments AS tla
  ON e.id = tla.employee_id
LEFT JOIN task_locations AS tl
  ON tla.task_location_id = tl.id
 AND tl.task_id = t.id
WHERE e.status = 'Hoạt động'
GROUP BY
  e.id,
  e.employee_code,
  e.full_name,
  e.department,
  e.position,
  e.phone;

COMMENT ON VIEW v_employee_real_workload IS
  'Employee workload excluding deleted projects and paused/cancelled tasks';
