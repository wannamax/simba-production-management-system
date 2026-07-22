-- Simba PMS 2.6.0-F: Orders & Production Workflow
BEGIN;

INSERT INTO system_catalogs(catalog_type,code,name,sort_order,is_default,is_active) VALUES
  ('UNIT','PIECE','Cái',10,true,true),
  ('UNIT','SET','Bộ',20,false,true),
  ('UNIT','METER','Mét',30,false,true),
  ('UNIT','SQUARE_METER','m²',40,false,true),
  ('UNIT','KILOGRAM','Kg',50,false,true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS project_orders (
  id BIGSERIAL PRIMARY KEY,
  order_code VARCHAR(50) NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_orders_status CHECK(status IN ('DRAFT','CONFIRMED','IN_PRODUCTION','COMPLETED','CANCELLED')),
  CONSTRAINT chk_project_orders_dates CHECK(expected_delivery_date IS NULL OR expected_delivery_date >= order_date)
);

CREATE TABLE IF NOT EXISTS project_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES project_orders(id) ON DELETE CASCADE,
  item_code VARCHAR(50),
  item_name VARCHAR(200) NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'Cái',
  quantity NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_order_item_quantity CHECK(quantity > 0),
  CONSTRAINT chk_project_order_item_price CHECK(unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS production_processes (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  project_types TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_process_stages (
  id BIGSERIAL PRIMARY KEY,
  process_id BIGINT NOT NULL REFERENCES production_processes(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(180) NOT NULL,
  work_item_id BIGINT REFERENCES work_items(id) ON DELETE RESTRICT,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  tracks_quantity BOOLEAN NOT NULL DEFAULT TRUE,
  allow_parallel BOOLEAN NOT NULL DEFAULT FALSE,
  default_hours NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_production_process_stage_sequence UNIQUE(process_id,sequence_no),
  CONSTRAINT uq_production_process_stage_code UNIQUE(process_id,code),
  CONSTRAINT chk_production_process_stage_sequence CHECK(sequence_no > 0),
  CONSTRAINT chk_production_process_stage_hours CHECK(default_hours IS NULL OR default_hours >= 0)
);

CREATE TABLE IF NOT EXISTS production_orders (
  id BIGSERIAL PRIMARY KEY,
  production_code VARCHAR(50) NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES project_orders(id) ON DELETE CASCADE,
  process_id BIGINT REFERENCES production_processes(id) ON DELETE SET NULL,
  process_name VARCHAR(180) NOT NULL,
  process_version INTEGER NOT NULL,
  process_snapshot JSONB NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  planned_start_date DATE,
  planned_end_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_production_orders_status CHECK(status IN ('PLANNED','IN_PROGRESS','READY_FOR_DELIVERY','COMPLETED','CANCELLED')),
  CONSTRAINT chk_production_orders_dates CHECK(planned_end_date IS NULL OR planned_start_date IS NULL OR planned_end_date >= planned_start_date)
);

CREATE TABLE IF NOT EXISTS production_order_items (
  id BIGSERIAL PRIMARY KEY,
  production_order_id BIGINT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  order_item_id BIGINT NOT NULL REFERENCES project_order_items(id) ON DELETE RESTRICT,
  planned_quantity NUMERIC(14,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_production_order_item UNIQUE(production_order_id,order_item_id),
  CONSTRAINT chk_production_order_item_quantity CHECK(planned_quantity > 0)
);

CREATE TABLE IF NOT EXISTS production_stage_instances (
  id BIGSERIAL PRIMARY KEY,
  production_order_id BIGINT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  source_stage_id BIGINT REFERENCES production_process_stages(id) ON DELETE SET NULL,
  sequence_no INTEGER NOT NULL,
  stage_code VARCHAR(50) NOT NULL,
  stage_name VARCHAR(180) NOT NULL,
  work_item_id BIGINT REFERENCES work_items(id) ON DELETE RESTRICT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  tracks_quantity BOOLEAN NOT NULL DEFAULT TRUE,
  allow_parallel BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  planned_start_date DATE,
  planned_end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_production_stage_instance_sequence UNIQUE(production_order_id,sequence_no),
  CONSTRAINT chk_production_stage_instance_status CHECK(status IN ('PLANNED','IN_PROGRESS','COMPLETED','BLOCKED','SKIPPED'))
);

CREATE TABLE IF NOT EXISTS production_stage_items (
  id BIGSERIAL PRIMARY KEY,
  stage_instance_id BIGINT NOT NULL REFERENCES production_stage_instances(id) ON DELETE CASCADE,
  production_order_item_id BIGINT NOT NULL REFERENCES production_order_items(id) ON DELETE CASCADE,
  planned_quantity NUMERIC(14,3) NOT NULL,
  good_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  defect_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  rework_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  CONSTRAINT uq_production_stage_item UNIQUE(stage_instance_id,production_order_item_id),
  CONSTRAINT chk_production_stage_item_quantities CHECK(planned_quantity > 0 AND good_quantity >= 0 AND defect_quantity >= 0 AND rework_quantity >= 0 AND good_quantity <= planned_quantity)
);

CREATE TABLE IF NOT EXISTS production_output_logs (
  id BIGSERIAL PRIMARY KEY,
  stage_item_id BIGINT NOT NULL REFERENCES production_stage_items(id) ON DELETE CASCADE,
  output_date DATE NOT NULL DEFAULT CURRENT_DATE,
  good_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  defect_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  rework_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_production_output_log_quantities CHECK(good_quantity >= 0 AND defect_quantity >= 0 AND rework_quantity >= 0 AND (good_quantity + defect_quantity + rework_quantity) > 0)
);

CREATE TABLE IF NOT EXISTS production_global_assignments (
  id BIGSERIAL PRIMARY KEY,
  production_order_id BIGINT NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  role VARCHAR(100) NOT NULL,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_production_global_assignment UNIQUE(production_order_id,employee_id,role),
  CONSTRAINT chk_production_global_assignment_dates CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_project_orders_project_status ON project_orders(project_id,status,order_date DESC);
CREATE INDEX IF NOT EXISTS idx_project_order_items_order ON project_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_production_processes_active ON production_processes(is_active,name);
CREATE INDEX IF NOT EXISTS idx_production_orders_order_status ON production_orders(order_id,status);
CREATE INDEX IF NOT EXISTS idx_production_orders_project_status ON production_orders(project_id,status);
CREATE INDEX IF NOT EXISTS idx_production_stages_order ON production_stage_instances(production_order_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_production_output_logs_stage_date ON production_output_logs(stage_item_id,output_date);

DROP TRIGGER IF EXISTS update_project_orders_updated_at ON project_orders;
CREATE TRIGGER update_project_orders_updated_at BEFORE UPDATE ON project_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_production_processes_updated_at ON production_processes;
CREATE TRIGGER update_production_processes_updated_at BEFORE UPDATE ON production_processes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_production_orders_updated_at ON production_orders;
CREATE TRIGGER update_production_orders_updated_at BEFORE UPDATE ON production_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_production_stage_instances_updated_at ON production_stage_instances;
CREATE TRIGGER update_production_stage_instances_updated_at BEFORE UPDATE ON production_stage_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
