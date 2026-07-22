-- Simba PMS 2.6.0-H: Production Stage & Work Separation
BEGIN;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS production_stage_instance_id BIGINT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE production_plans ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE production_plans ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE production_plans ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_production_stage_instance_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_production_stage_instance_id_fkey
      FOREIGN KEY(production_stage_instance_id) REFERENCES production_stage_instances(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Preserve every G-era generated Task as the first Work item under its Stage.
UPDATE tasks task
SET production_stage_instance_id=stage.id
FROM production_stage_instances stage
WHERE stage.task_id=task.id AND task.production_stage_instance_id IS NULL;

-- H no longer treats Stage as a single Task. Keep the legacy column only for
-- migration compatibility; all application reads use tasks.production_stage_instance_id.
UPDATE production_stage_instances SET task_id=NULL WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_production_stage_active
  ON tasks(production_stage_instance_id,deleted_at,status);
CREATE INDEX IF NOT EXISTS idx_production_orders_cancelled
  ON production_orders(order_id,status,cancelled_at);

COMMIT;
