BEGIN;

CREATE TABLE IF NOT EXISTS inventory_balances (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  quantity_on_hand NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  average_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
  last_transaction_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (quantity_reserved <= quantity_on_hand)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balances_no_location
  ON inventory_balances(material_id, warehouse_id) WHERE location_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balances_with_location
  ON inventory_balances(material_id, warehouse_id, location_id) WHERE location_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_material_requirements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  planned_quantity NUMERIC(18,6) NOT NULL CHECK (planned_quantity > 0),
  base_unit_id INTEGER NOT NULL REFERENCES material_units(id) ON DELETE RESTRICT,
  estimated_unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (estimated_unit_cost >= 0),
  required_date DATE,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  source_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('MANUAL','TEMPLATE','TASK_AGGREGATION','IMPORT','REVISION')),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','PARTIALLY_RESERVED','FULLY_RESERVED','PARTIALLY_ISSUED','COMPLETED','CANCELLED')),
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_material_requirements_project ON project_material_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_project_material_requirements_task ON project_material_requirements(task_id);
CREATE INDEX IF NOT EXISTS idx_project_material_requirements_material_date ON project_material_requirements(material_id, required_date);

CREATE TABLE IF NOT EXISTS project_material_requirement_revisions (
  id SERIAL PRIMARY KEY,
  requirement_id INTEGER NOT NULL REFERENCES project_material_requirements(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  old_quantity NUMERIC(18,6),
  new_quantity NUMERIC(18,6) NOT NULL,
  old_required_date DATE,
  new_required_date DATE,
  reason TEXT,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(requirement_id, revision_number)
);

CREATE TABLE IF NOT EXISTS material_reservations (
  id SERIAL PRIMARY KEY,
  requirement_id INTEGER NOT NULL REFERENCES project_material_requirements(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  reserved_quantity NUMERIC(18,6) NOT NULL CHECK (reserved_quantity > 0),
  issued_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  released_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (released_quantity >= 0),
  required_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','PARTIALLY_ISSUED','COMPLETED','RELEASED','CANCELLED')),
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (issued_quantity + released_quantity <= reserved_quantity)
);
CREATE INDEX IF NOT EXISTS idx_material_reservations_requirement ON material_reservations(requirement_id);
CREATE INDEX IF NOT EXISTS idx_material_reservations_project ON material_reservations(project_id);
CREATE INDEX IF NOT EXISTS idx_material_reservations_material_warehouse ON material_reservations(material_id, warehouse_id);

CREATE OR REPLACE VIEW v_project_material_planning AS
SELECT
  r.id,
  r.project_id,
  r.task_id,
  r.material_id,
  r.planned_quantity,
  r.base_unit_id,
  r.estimated_unit_cost,
  r.required_date,
  r.priority,
  r.source_type,
  r.status,
  r.note,
  COALESCE(SUM(mr.reserved_quantity - mr.released_quantity), 0)::numeric(18,6) AS reserved_quantity,
  GREATEST(r.planned_quantity - COALESCE(SUM(mr.reserved_quantity - mr.released_quantity), 0), 0)::numeric(18,6) AS shortage_quantity,
  (r.planned_quantity * r.estimated_unit_cost)::numeric(18,4) AS estimated_total_cost
FROM project_material_requirements r
LEFT JOIN material_reservations mr ON mr.requirement_id=r.id AND mr.status NOT IN ('RELEASED','CANCELLED')
GROUP BY r.id;

COMMIT;
