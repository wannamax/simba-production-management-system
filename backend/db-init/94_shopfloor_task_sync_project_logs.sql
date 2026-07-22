BEGIN;

ALTER TABLE shopfloor_work_boards
  DROP CONSTRAINT IF EXISTS shopfloor_work_boards_status_check;
ALTER TABLE shopfloor_work_boards
  ADD CONSTRAINT shopfloor_work_boards_status_check
  CHECK (status IN ('DRAFT','PUBLISHED','LOCKED','CLOSED'));
ALTER TABLE shopfloor_work_boards
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closeout_summary TEXT;

ALTER TABLE shopfloor_work_board_items
  DROP CONSTRAINT IF EXISTS shopfloor_work_board_items_status_check;
ALTER TABLE shopfloor_work_board_items
  ADD CONSTRAINT shopfloor_work_board_items_status_check
  CHECK (status IN ('NOT_STARTED','READY','IN_PROGRESS','WAITING_MATERIAL','ISSUE','PAUSED','COMPLETED','ABSENT'));
ALTER TABLE shopfloor_work_board_items
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL'
    CHECK (source_type IN ('TASK_ASSIGNMENT','MANUAL','ABSENCE')),
  ADD COLUMN IF NOT EXISTS source_task_assignment_id INTEGER REFERENCES task_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS absence_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS absence_reason TEXT,
  ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(8,2) CHECK (actual_hours IS NULL OR actual_hours >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shopfloor_item_task_assignment
  ON shopfloor_work_board_items(board_id,source_task_assignment_id)
  WHERE source_task_assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shopfloor_item_project_date_source
  ON shopfloor_work_board_items(project_id,source_type,board_id);

CREATE TABLE IF NOT EXISTS shopfloor_work_board_daily_logs (
  id BIGSERIAL PRIMARY KEY,
  board_id BIGINT NOT NULL UNIQUE REFERENCES shopfloor_work_boards(id) ON DELETE RESTRICT,
  log_date DATE NOT NULL,
  shift_code VARCHAR(30) NOT NULL,
  shift_name VARCHAR(100) NOT NULL,
  workshop VARCHAR(150) NOT NULL,
  summary TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  absence_count INTEGER NOT NULL DEFAULT 0,
  project_count INTEGER NOT NULL DEFAULT 0,
  snapshot_data JSONB NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopfloor_daily_logs_date
  ON shopfloor_work_board_daily_logs(log_date DESC,workshop);

CREATE TABLE IF NOT EXISTS shopfloor_project_daily_logs (
  id BIGSERIAL PRIMARY KEY,
  daily_log_id BIGINT NOT NULL REFERENCES shopfloor_work_board_daily_logs(id) ON DELETE RESTRICT,
  board_id BIGINT NOT NULL REFERENCES shopfloor_work_boards(id) ON DELETE RESTRICT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  log_date DATE NOT NULL,
  shift_name VARCHAR(100) NOT NULL,
  workshop VARCHAR(150) NOT NULL,
  summary TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  planned_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  actual_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  snapshot_data JSONB NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(board_id,project_id)
);
CREATE INDEX IF NOT EXISTS idx_shopfloor_project_logs_project_date
  ON shopfloor_project_daily_logs(project_id,log_date DESC);

COMMIT;
