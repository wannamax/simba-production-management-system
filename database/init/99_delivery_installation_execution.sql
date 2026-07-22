-- Simba PMS 2.6.0-E: Delivery & Installation Execution

ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS execution_type VARCHAR(20);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS execution_type VARCHAR(20);

UPDATE work_items
SET execution_type = CASE
  WHEN code='DELIVERY' OR LOWER(name) LIKE '%giao hàng%' THEN 'DELIVERY'
  WHEN code='ON_SITE_INSTALLATION' OR LOWER(name) LIKE '%lắp đặt%' OR LOWER(name) LIKE '%lắp đặ%' THEN 'INSTALLATION'
  ELSE execution_type
END
WHERE execution_type IS NULL;

UPDATE tasks task
SET execution_type = COALESCE(item.execution_type, CASE
  WHEN LOWER(CONCAT_WS(' ',task.task_type,task.task_name)) LIKE '%giao hàng%' THEN 'DELIVERY'
  WHEN LOWER(CONCAT_WS(' ',task.task_type,task.task_name)) LIKE '%lắp đặt%' OR LOWER(CONCAT_WS(' ',task.task_type,task.task_name)) LIKE '%lắp đặ%' THEN 'INSTALLATION'
  ELSE NULL
END)
FROM work_items item
WHERE item.id=task.work_item_id AND task.execution_type IS NULL;

UPDATE tasks
SET execution_type = CASE
  WHEN LOWER(CONCAT_WS(' ',task_type,task_name)) LIKE '%giao hàng%' THEN 'DELIVERY'
  WHEN LOWER(CONCAT_WS(' ',task_type,task_name)) LIKE '%lắp đặt%'
    OR LOWER(CONCAT_WS(' ',task_type,task_name)) LIKE '%lắp đặ%' THEN 'INSTALLATION'
  ELSE NULL
END
WHERE execution_type IS NULL;

CREATE TABLE IF NOT EXISTS task_location_import_batches (
  id BIGSERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  original_filename VARCHAR(255),
  import_mode VARCHAR(20) NOT NULL DEFAULT 'UPSERT',
  status VARCHAR(20) NOT NULL DEFAULT 'PREVIEW',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  applied_rows INTEGER NOT NULL DEFAULT 0,
  preview_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

ALTER TABLE task_locations
  ADD COLUMN IF NOT EXISTS execution_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS location_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sequence_no INTEGER,
  ADD COLUMN IF NOT EXISTS province_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS commune_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS planned_date DATE,
  ADD COLUMN IF NOT EXISTS actual_completion_date DATE,
  ADD COLUMN IF NOT EXISTS assigned_employee_id INTEGER,
  ADD COLUMN IF NOT EXISTS completion_note TEXT,
  ADD COLUMN IF NOT EXISTS completed_by INTEGER,
  ADD COLUMN IF NOT EXISTS completion_source VARCHAR(20),
  ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS import_batch_id BIGINT;

UPDATE task_locations location
SET execution_type=COALESCE(location.execution_type,task.execution_type,'INSTALLATION'),
    planned_date=COALESCE(location.planned_date,location.installation_date),
    actual_completion_date=COALESCE(location.actual_completion_date,location.completed_at::date),
    sequence_no=COALESCE(location.sequence_no,location.display_order,location.id),
    location_code=COALESCE(location.location_code,'LOC-'||location.task_id||'-'||LPAD(location.id::text,5,'0'))
FROM tasks task
WHERE task.id=location.task_id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_locations_province_code_fkey') THEN
    ALTER TABLE task_locations ADD CONSTRAINT task_locations_province_code_fkey
      FOREIGN KEY(province_code) REFERENCES administrative_provinces(code) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_locations_commune_code_fkey') THEN
    ALTER TABLE task_locations ADD CONSTRAINT task_locations_commune_code_fkey
      FOREIGN KEY(commune_code) REFERENCES administrative_communes(code) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_locations_assigned_employee_id_fkey') THEN
    ALTER TABLE task_locations ADD CONSTRAINT task_locations_assigned_employee_id_fkey
      FOREIGN KEY(assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_locations_import_batch_id_fkey') THEN
    ALTER TABLE task_locations ADD CONSTRAINT task_locations_import_batch_id_fkey
      FOREIGN KEY(import_batch_id) REFERENCES task_location_import_batches(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='task_locations_task_code_key') THEN
    ALTER TABLE task_locations ADD CONSTRAINT task_locations_task_code_key UNIQUE(task_id,location_code);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_location_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  location_id INTEGER REFERENCES task_locations(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  previous_data JSONB,
  current_data JSONB,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_locations_execution
  ON task_locations(task_id,execution_type,status,planned_date);
CREATE INDEX IF NOT EXISTS idx_task_locations_administrative
  ON task_locations(province_code,commune_code,planned_date);
CREATE INDEX IF NOT EXISTS idx_task_locations_employee
  ON task_locations(assigned_employee_id,planned_date);
CREATE INDEX IF NOT EXISTS idx_task_location_import_batches_task
  ON task_location_import_batches(task_id,created_at DESC);

CREATE OR REPLACE FUNCTION increment_task_location_row_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version = COALESCE(OLD.row_version,0) + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_increment_task_location_row_version ON task_locations;
CREATE TRIGGER trigger_increment_task_location_row_version
  BEFORE UPDATE ON task_locations
  FOR EACH ROW EXECUTE FUNCTION increment_task_location_row_version();
