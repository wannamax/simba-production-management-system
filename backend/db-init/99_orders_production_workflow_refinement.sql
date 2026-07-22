-- Simba PMS 2.6.0-F refinement: real order statuses and starter workflow
BEGIN;

ALTER TABLE project_orders ALTER COLUMN status SET DEFAULT 'NOT_STARTED';
ALTER TABLE project_orders DROP CONSTRAINT IF EXISTS chk_project_orders_status;
UPDATE project_orders SET status='NOT_STARTED' WHERE status IN ('DRAFT','CONFIRMED');
ALTER TABLE project_orders ADD CONSTRAINT chk_project_orders_status
  CHECK(status IN ('NOT_STARTED','IN_PRODUCTION','COMPLETED','CANCELLED'));

INSERT INTO production_processes(code,name,description,project_types,is_active)
VALUES(
  'BASIC_PRODUCTION',
  'Quy trình sản xuất cơ bản',
  'Mẫu khởi tạo của hệ thống. Có thể chỉnh công đoạn và liên kết Công việc trong Cài đặt > Quy trình sản xuất.',
  '{}',
  TRUE
)
ON CONFLICT(code) DO NOTHING;

INSERT INTO production_process_stages(process_id,sequence_no,code,name,work_item_id,is_required,tracks_quantity,allow_parallel,default_hours)
SELECT process.id,stage.sequence_no,stage.code,stage.name,work_item.id,TRUE,TRUE,stage.allow_parallel,8
FROM production_processes process
CROSS JOIN (VALUES
  (1,'PREPARATION','Chuẩn bị sản xuất','DESIGN',FALSE),
  (2,'FABRICATION','Gia công / Sản xuất','LIGHTBOX_FRAME',FALSE),
  (3,'FINISHING','Hoàn thiện và kiểm tra','SUPERVISION',FALSE)
) stage(sequence_no,code,name,work_item_code,allow_parallel)
LEFT JOIN work_items work_item ON work_item.code=stage.work_item_code
WHERE process.code='BASIC_PRODUCTION'
ON CONFLICT(process_id,sequence_no) DO NOTHING;

COMMIT;
