BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS closeout_status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closeout_notes TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='projects_closeout_status_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_closeout_status_check CHECK (closeout_status IN ('OPEN','READY','CLOSED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_closeout_checklist_items (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code VARCHAR(80) NOT NULL,
  label VARCHAR(240) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id,item_code)
);
CREATE INDEX IF NOT EXISTS idx_project_closeout_checklist_project ON project_closeout_checklist_items(project_id,sort_order);

CREATE TABLE IF NOT EXISTS project_closeout_snapshots (
  id BIGSERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  snapshot_version INTEGER NOT NULL,
  snapshot_data JSONB NOT NULL,
  total_employees INTEGER NOT NULL DEFAULT 0,
  total_work_hours NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_material_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_actual_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closure_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id,snapshot_version)
);
CREATE INDEX IF NOT EXISTS idx_project_closeout_snapshots_project ON project_closeout_snapshots(project_id,closed_at DESC);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS closeout_snapshot_id BIGINT REFERENCES project_closeout_snapshots(id) ON DELETE SET NULL;

COMMIT;
