BEGIN;

ALTER TABLE inventory_documents ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE inventory_document_lines ADD COLUMN IF NOT EXISTS requirement_id INTEGER REFERENCES project_material_requirements(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS reservation_id INTEGER REFERENCES material_reservations(id) ON DELETE RESTRICT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS requirement_id INTEGER REFERENCES project_material_requirements(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS reservation_id INTEGER REFERENCES material_reservations(id) ON DELETE RESTRICT;
ALTER TABLE material_reservations ADD COLUMN IF NOT EXISTS returned_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='material_reservations_returned_check') THEN
    ALTER TABLE material_reservations ADD CONSTRAINT material_reservations_returned_check CHECK (returned_quantity <= issued_quantity);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_documents_project ON inventory_documents(project_id,document_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_document_lines_requirement ON inventory_document_lines(requirement_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_project ON inventory_transactions(project_id,transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_requirement ON inventory_transactions(requirement_id,transaction_date DESC);

CREATE OR REPLACE VIEW v_project_material_actuals AS
SELECT r.id requirement_id,r.project_id,r.task_id,r.material_id,
  COALESCE(SUM(t.stock_direction * -1 * t.base_quantity),0)::numeric(18,6) net_issued_quantity,
  COALESCE(SUM(t.stock_direction * -1 * t.total_cost),0)::numeric(18,4) actual_cost
FROM project_material_requirements r LEFT JOIN inventory_transactions t ON t.requirement_id=r.id
GROUP BY r.id,r.project_id,r.task_id,r.material_id;

COMMIT;
