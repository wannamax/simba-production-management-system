-- Simba PMS 2.6.0-K: one automatic production workspace for every order.
BEGIN;

ALTER TABLE production_plans
  ADD COLUMN IF NOT EXISTS is_order_workspace BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE production_orders
  ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) NOT NULL DEFAULT 'WORKFLOW';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_production_orders_order_type') THEN
    ALTER TABLE production_orders ADD CONSTRAINT chk_production_orders_order_type
      CHECK (order_type IN ('DIRECT','WORKFLOW'));
  END IF;
END $$;

-- Preserve the oldest existing plan as the order's workspace, then create one
-- for legacy orders that were never planned. The workspace is an internal
-- coordination/log record; users do not create it manually.
WITH first_plan AS (
  SELECT DISTINCT ON (order_id) id
  FROM production_plans
  ORDER BY order_id, created_at, id
)
UPDATE production_plans plan
SET is_order_workspace=true
FROM first_plan
WHERE plan.id=first_plan.id
  AND NOT EXISTS (
    SELECT 1 FROM production_plans workspace
    WHERE workspace.order_id=plan.order_id AND workspace.is_order_workspace
  );

INSERT INTO production_plans(
  plan_code,project_id,order_id,time_mode,planned_start_date,planned_end_date,
  project_schedule_snapshot,status,notes,is_order_workspace,created_by
)
SELECT
  'MPL-WS-' || orders.id,
  orders.project_id,
  orders.id,
  'CUSTOM',
  orders.order_date,
  orders.expected_delivery_date,
  jsonb_build_object('automatic',true,'source','ORDER_WORKSPACE'),
  CASE
    WHEN orders.status='COMPLETED' THEN 'COMPLETED'
    WHEN orders.status='CANCELLED' THEN 'CANCELLED'
    WHEN orders.status='IN_PRODUCTION' THEN 'IN_PROGRESS'
    ELSE 'PLANNED'
  END,
  'Không gian thực hiện tự động của Đơn hàng',
  true,
  orders.created_by
FROM project_orders orders
WHERE NOT EXISTS (
  SELECT 1 FROM production_plans workspace
  WHERE workspace.order_id=orders.id AND workspace.is_order_workspace
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_production_plans_one_order_workspace
  ON production_plans(order_id) WHERE is_order_workspace;
CREATE INDEX IF NOT EXISTS idx_production_orders_order_type_created
  ON production_orders(order_id,order_type,created_at DESC);

COMMIT;
