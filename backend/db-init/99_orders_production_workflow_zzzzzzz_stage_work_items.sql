-- Simba PMS 2.6.0-K Issue #04: optional multi-work-item links for process stages.
BEGIN;

CREATE TABLE IF NOT EXISTS production_process_stage_work_items (
  production_process_stage_id BIGINT NOT NULL REFERENCES production_process_stages(id) ON DELETE CASCADE,
  work_item_id BIGINT NOT NULL REFERENCES work_items(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (production_process_stage_id, work_item_id)
);

-- Keep every existing single link as the first compatible multi-link.
INSERT INTO production_process_stage_work_items(production_process_stage_id, work_item_id)
SELECT id, work_item_id
FROM production_process_stages
WHERE work_item_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_production_process_stage_work_items_work_item
  ON production_process_stage_work_items(work_item_id);

COMMIT;
