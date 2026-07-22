-- 2.6.0-H hotfix: order-level cancellation audit for legacy/stuck orders.
ALTER TABLE project_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE project_orders ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE project_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_project_orders_cancelled
  ON project_orders(status,cancelled_at);
