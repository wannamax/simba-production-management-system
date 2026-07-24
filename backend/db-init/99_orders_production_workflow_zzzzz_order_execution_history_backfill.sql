-- Backfill execution history for production orders cancelled before order_execution_logs existed.
INSERT INTO order_execution_logs(
  order_id,
  production_order_id,
  event_type,
  event_summary,
  system_note,
  production_order_snapshot,
  metadata,
  performed_by,
  event_at
)
SELECT
  production.order_id,
  production.id,
  'PRODUCTION_CANCELLED',
  'Hủy đơn ' || production.production_code,
  COALESCE((
    SELECT 'Trả ' || string_agg(source.item_name || ': ' || production_item.planned_quantity || ' ' || source.unit, '; ' ORDER BY source.id) || ' về đơn'
    FROM production_order_items production_item
    JOIN project_order_items source ON source.id=production_item.order_item_id
    WHERE production_item.production_order_id=production.id
  ),'Không có hạng mục cần trả về đơn'),
  jsonb_build_object(
    'id',production.id,
    'production_code',production.production_code,
    'plan_code',plan.plan_code,
    'order_id',production.order_id,
    'order_code',orders.order_code,
    'project_id',production.project_id,
    'project_code',project.project_code,
    'project_name',project.project_name,
    'company_name',customer.company_name,
    'group_name',production.group_name,
    'process_name',production.process_name,
    'process_version',production.process_version,
    'status',production.status,
    'cancellation_reason',production.cancellation_reason,
    'cancelled_at',production.cancelled_at,
    'items',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',production_item.id,
        'order_item_id',source.id,
        'item_code',source.item_code,
        'item_name',source.item_name,
        'unit',source.unit,
        'planned_quantity',production_item.planned_quantity
      ) ORDER BY source.id)
      FROM production_order_items production_item
      JOIN project_order_items source ON source.id=production_item.order_item_id
      WHERE production_item.production_order_id=production.id
    ),'[]'::jsonb)
  ),
  jsonb_build_object('backfilled',true),
  production.cancelled_by,
  COALESCE(production.cancelled_at,production.updated_at,production.created_at,NOW())
FROM production_orders production
JOIN project_orders orders ON orders.id=production.order_id
JOIN projects project ON project.id=production.project_id
LEFT JOIN customers customer ON customer.id=project.customer_id
LEFT JOIN production_plans plan ON plan.id=production.production_plan_id
WHERE production.status='CANCELLED'
  AND NOT EXISTS (
    SELECT 1 FROM order_execution_logs log
    WHERE log.production_order_id=production.id
      AND log.event_type='PRODUCTION_CANCELLED'
  );
