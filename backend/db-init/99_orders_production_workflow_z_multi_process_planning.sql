-- Simba PMS 2.6.0-G: Multi-Process Production Planning
BEGIN;

CREATE TABLE IF NOT EXISTS production_plans (
  id BIGSERIAL PRIMARY KEY,
  plan_code VARCHAR(50) NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES project_orders(id) ON DELETE CASCADE,
  time_mode VARCHAR(20) NOT NULL DEFAULT 'PHASE',
  planned_start_date DATE,
  planned_end_date DATE,
  project_schedule_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_production_plans_time_mode CHECK(time_mode IN ('PROJECT','PHASE','CUSTOM')),
  CONSTRAINT chk_production_plans_status CHECK(status IN ('PLANNED','IN_PROGRESS','READY_FOR_DELIVERY','COMPLETED','CANCELLED')),
  CONSTRAINT chk_production_plans_dates CHECK(planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date >= planned_start_date)
);

CREATE TABLE IF NOT EXISTS production_plan_assignments (
  id BIGSERIAL PRIMARY KEY,
  production_plan_id BIGINT NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  role VARCHAR(100) NOT NULL,
  time_mode VARCHAR(20) NOT NULL DEFAULT 'PLAN',
  start_date DATE,
  end_date DATE,
  work_dates DATE[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_production_plan_assignment UNIQUE(production_plan_id,employee_id,role),
  CONSTRAINT chk_production_plan_assignment_mode CHECK(time_mode IN ('PROJECT','PLAN','CUSTOM')),
  CONSTRAINT chk_production_plan_assignment_dates CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS production_plan_id BIGINT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS group_name VARCHAR(180);
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS time_mode VARCHAR(20) DEFAULT 'CUSTOM';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='production_orders_production_plan_id_fkey') THEN
    ALTER TABLE production_orders ADD CONSTRAINT production_orders_production_plan_id_fkey
      FOREIGN KEY(production_plan_id) REFERENCES production_plans(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_production_orders_time_mode') THEN
    ALTER TABLE production_orders ADD CONSTRAINT chk_production_orders_time_mode
      CHECK(time_mode IN ('PROJECT','PHASE','CUSTOM'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_production_plans_order_status ON production_plans(order_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_plans_project_status ON production_plans(project_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_plan_assignments_plan ON production_plan_assignments(production_plan_id,employee_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_plan ON production_orders(production_plan_id,status);

DROP TRIGGER IF EXISTS update_production_plans_updated_at ON production_plans;
CREATE TRIGGER update_production_plans_updated_at BEFORE UPDATE ON production_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
