-- Simba PMS 2.6.0-J: Order execution history and safe cancelled production cleanup.
CREATE TABLE IF NOT EXISTS order_execution_logs (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES project_orders(id) ON DELETE CASCADE,
  production_order_id BIGINT REFERENCES production_orders(id) ON DELETE SET NULL,
  event_type VARCHAR(40) NOT NULL,
  event_summary TEXT NOT NULL,
  system_note TEXT,
  production_order_snapshot JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_execution_logs_order_time
  ON order_execution_logs(order_id,event_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_order_execution_logs_production
  ON order_execution_logs(production_order_id,event_at DESC);
