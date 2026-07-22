-- Simba PMS 2.6.0-I: Order Workspace & Production Order Control
BEGIN;

CREATE TABLE IF NOT EXISTS order_item_change_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES project_orders(id) ON DELETE CASCADE,
  order_item_id BIGINT REFERENCES project_order_items(id) ON DELETE SET NULL,
  change_type VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_order_item_change_type CHECK(change_type IN ('ADD_ITEM','QUANTITY_CHANGE','PRODUCTION_ORDER_CHANGE'))
);

CREATE INDEX IF NOT EXISTS idx_order_item_change_logs_order
  ON order_item_change_logs(order_id,created_at DESC,id DESC);

COMMIT;
