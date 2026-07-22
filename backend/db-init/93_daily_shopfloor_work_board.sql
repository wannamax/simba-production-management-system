BEGIN;

CREATE TABLE IF NOT EXISTS shopfloor_work_boards (
  id BIGSERIAL PRIMARY KEY,
  board_date DATE NOT NULL,
  shift_code VARCHAR(30) NOT NULL,
  shift_name VARCHAR(100) NOT NULL,
  shift_start TIME NOT NULL,
  shift_end TIME NOT NULL,
  workshop VARCHAR(150) NOT NULL DEFAULT 'Xưởng chính',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','LOCKED')),
  announcement TEXT,
  display_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  published_version INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(board_date,shift_code,workshop)
);

CREATE TABLE IF NOT EXISTS shopfloor_work_board_items (
  id BIGSERIAL PRIMARY KEY,
  board_id BIGINT NOT NULL REFERENCES shopfloor_work_boards(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title VARCHAR(240) NOT NULL,
  work_area VARCHAR(150),
  start_time TIME,
  end_time TIME,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status VARCHAR(30) NOT NULL DEFAULT 'READY' CHECK (status IN ('NOT_STARTED','READY','IN_PROGRESS','WAITING_MATERIAL','ISSUE','PAUSED','COMPLETED')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopfloor_items_board ON shopfloor_work_board_items(board_id,sort_order,id);

CREATE TABLE IF NOT EXISTS shopfloor_work_board_assignments (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES shopfloor_work_board_items(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  team_name VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (employee_id IS NOT NULL OR NULLIF(BTRIM(team_name),'') IS NOT NULL),
  UNIQUE(item_id,employee_id)
);
CREATE INDEX IF NOT EXISTS idx_shopfloor_assignments_item ON shopfloor_work_board_assignments(item_id);

CREATE TABLE IF NOT EXISTS shopfloor_work_board_publications (
  id BIGSERIAL PRIMARY KEY,
  board_id BIGINT NOT NULL REFERENCES shopfloor_work_boards(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_data JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(board_id,version)
);

COMMIT;
