-- Simba PMS 2.6.0-D: Assignment Calendar & Task Views

CREATE TABLE IF NOT EXISTS task_assignment_work_days (
  id BIGSERIAL PRIMARY KEY,
  task_assignment_id INTEGER NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  planned_hours NUMERIC(5,2) NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_task_assignment_work_day UNIQUE(task_assignment_id, work_date),
  CONSTRAINT chk_task_assignment_work_day_hours CHECK(planned_hours > 0 AND planned_hours <= 24)
);

CREATE INDEX IF NOT EXISTS idx_task_assignment_work_days_date
  ON task_assignment_work_days(work_date, task_assignment_id);

INSERT INTO task_assignment_work_days(task_assignment_id, work_date, planned_hours)
SELECT ta.id, day::date, 8
FROM task_assignments ta
CROSS JOIN LATERAL generate_series(ta.start_date, ta.end_date, INTERVAL '1 day') day
WHERE ta.start_date IS NOT NULL AND ta.end_date IS NOT NULL
ON CONFLICT(task_assignment_id, work_date) DO NOTHING;

CREATE OR REPLACE FUNCTION refresh_task_assignment_plan(p_task_id INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE tasks t
  SET start_date = summary.start_date,
      end_date = summary.end_date,
      estimated_duration = summary.work_days,
      estimated_hours = summary.planned_hours,
      updated_at = NOW()
  FROM (
    SELECT
      MIN(day.work_date) AS start_date,
      MAX(day.work_date) AS end_date,
      COUNT(DISTINCT day.work_date)::integer AS work_days,
      COALESCE(SUM(day.planned_hours), 0)::numeric(10,2) AS planned_hours
    FROM task_assignments assignment
    JOIN task_assignment_work_days day ON day.task_assignment_id = assignment.id
    WHERE assignment.task_id = p_task_id AND assignment.is_active = TRUE
  ) summary
  WHERE t.id = p_task_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_refresh_task_assignment_plan()
RETURNS TRIGGER AS $$
DECLARE
  affected_task_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'task_assignment_work_days' THEN
    SELECT task_id INTO affected_task_id
    FROM task_assignments
    WHERE id = COALESCE(NEW.task_assignment_id, OLD.task_assignment_id);
  ELSE
    affected_task_id := COALESCE(NEW.task_id, OLD.task_id);
  END IF;

  IF affected_task_id IS NOT NULL THEN
    PERFORM refresh_task_assignment_plan(affected_task_id);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_refresh_task_plan_from_days ON task_assignment_work_days;
CREATE TRIGGER trigger_refresh_task_plan_from_days
  AFTER INSERT OR UPDATE OR DELETE ON task_assignment_work_days
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_task_assignment_plan();

DROP TRIGGER IF EXISTS trigger_refresh_task_plan_from_assignments ON task_assignments;
CREATE TRIGGER trigger_refresh_task_plan_from_assignments
  AFTER UPDATE OF is_active ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION trigger_refresh_task_assignment_plan();

DO $$
DECLARE task_row RECORD;
BEGIN
  FOR task_row IN
    SELECT DISTINCT task_id FROM task_assignments
  LOOP
    PERFORM refresh_task_assignment_plan(task_row.task_id);
  END LOOP;
END $$;
