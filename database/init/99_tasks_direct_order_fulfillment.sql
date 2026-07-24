-- Simba PMS 2.6.0-J: Direct Project Tasks & Order Fulfillment
BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_source_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS order_id BIGINT;

UPDATE tasks
SET task_source_type=CASE
  WHEN production_stage_instance_id IS NOT NULL THEN 'PRODUCTION_STAGE'
  ELSE 'PROJECT_DIRECT'
END
WHERE task_source_type IS NULL;

ALTER TABLE tasks ALTER COLUMN task_source_type SET DEFAULT 'PROJECT_DIRECT';
ALTER TABLE tasks ALTER COLUMN task_source_type SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_order_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_order_id_fkey
      FOREIGN KEY(order_id) REFERENCES project_orders(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_tasks_source_type') THEN
    ALTER TABLE tasks ADD CONSTRAINT chk_tasks_source_type
      CHECK(task_source_type IN ('PRODUCTION_STAGE','PROJECT_DIRECT','ORDER_FULFILLMENT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_tasks_source_links') THEN
    ALTER TABLE tasks ADD CONSTRAINT chk_tasks_source_links CHECK(
      (task_source_type='PRODUCTION_STAGE' AND production_stage_instance_id IS NOT NULL AND order_id IS NULL)
      OR (task_source_type='PROJECT_DIRECT' AND production_stage_instance_id IS NULL AND order_id IS NULL)
      OR (task_source_type='ORDER_FULFILLMENT' AND production_stage_instance_id IS NULL AND order_id IS NOT NULL)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS task_order_fulfillment_items (
  id BIGSERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  order_item_id BIGINT NOT NULL REFERENCES project_order_items(id) ON DELETE CASCADE,
  execution_type VARCHAR(20) NOT NULL,
  planned_quantity NUMERIC(14,3) NOT NULL,
  completed_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_task_order_fulfillment_item UNIQUE(task_id,order_item_id),
  CONSTRAINT chk_task_order_fulfillment_execution CHECK(execution_type IN ('DELIVERY','INSTALLATION')),
  CONSTRAINT chk_task_order_fulfillment_quantity CHECK(
    planned_quantity>0 AND completed_quantity>=0 AND completed_quantity<=planned_quantity
  )
);

CREATE INDEX IF NOT EXISTS idx_tasks_source_project
  ON tasks(project_id,task_source_type,deleted_at,status);
CREATE INDEX IF NOT EXISTS idx_tasks_direct_order
  ON tasks(order_id,task_source_type,deleted_at,status);
CREATE INDEX IF NOT EXISTS idx_task_fulfillment_order_item
  ON task_order_fulfillment_items(order_item_id,execution_type);

CREATE OR REPLACE FUNCTION validate_task_source_links()
RETURNS TRIGGER AS $$
DECLARE
  linked_project_id INTEGER;
BEGIN
  IF NEW.task_source_type='PRODUCTION_STAGE' THEN
    IF NEW.production_stage_instance_id IS NULL OR NEW.order_id IS NOT NULL THEN
      RAISE EXCEPTION 'Công việc sản xuất phải thuộc đúng một Công đoạn';
    END IF;
  ELSIF NEW.task_source_type='PROJECT_DIRECT' THEN
    IF NEW.production_stage_instance_id IS NOT NULL OR NEW.order_id IS NOT NULL THEN
      RAISE EXCEPTION 'Công việc trực tiếp chỉ được liên kết với Dự án';
    END IF;
  ELSIF NEW.task_source_type='ORDER_FULFILLMENT' THEN
    IF NEW.production_stage_instance_id IS NOT NULL OR NEW.order_id IS NULL THEN
      RAISE EXCEPTION 'Công việc thực thi Đơn hàng phải có Đơn hàng và không thuộc Công đoạn';
    END IF;
    IF NEW.execution_type NOT IN ('DELIVERY','INSTALLATION') THEN
      RAISE EXCEPTION 'Thực thi Đơn hàng chỉ áp dụng cho Giao hàng hoặc Lắp đặt';
    END IF;
    SELECT project_id INTO linked_project_id FROM project_orders WHERE id=NEW.order_id;
    IF linked_project_id IS NULL OR linked_project_id<>NEW.project_id THEN
      RAISE EXCEPTION 'Đơn hàng không thuộc Dự án của nhiệm vụ';
    END IF;
  ELSE
    RAISE EXCEPTION 'Nguồn nhiệm vụ không hợp lệ';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_task_source_links ON tasks;
CREATE TRIGGER trigger_validate_task_source_links
  BEFORE INSERT OR UPDATE OF task_source_type,production_stage_instance_id,order_id,project_id,execution_type
  ON tasks FOR EACH ROW EXECUTE FUNCTION validate_task_source_links();

CREATE OR REPLACE FUNCTION validate_task_fulfillment_item()
RETURNS TRIGGER AS $$
DECLARE
  source_task tasks%ROWTYPE;
  source_item project_order_items%ROWTYPE;
  allocated NUMERIC(14,3);
BEGIN
  SELECT * INTO source_task FROM tasks WHERE id=NEW.task_id;
  IF source_task.id IS NULL OR source_task.task_source_type<>'ORDER_FULFILLMENT' THEN
    RAISE EXCEPTION 'Hạng mục giao/lắp chỉ được gắn với nhiệm vụ thực thi Đơn hàng';
  END IF;
  IF source_task.execution_type<>NEW.execution_type THEN
    RAISE EXCEPTION 'Loại thực thi hạng mục không khớp Công việc';
  END IF;

  SELECT * INTO source_item FROM project_order_items WHERE id=NEW.order_item_id FOR UPDATE;
  IF source_item.id IS NULL OR source_item.order_id<>source_task.order_id THEN
    RAISE EXCEPTION 'Hạng mục không thuộc Đơn hàng đã chọn';
  END IF;

  SELECT COALESCE(SUM(link.planned_quantity),0) INTO allocated
  FROM task_order_fulfillment_items link
  JOIN tasks task ON task.id=link.task_id
  WHERE link.order_item_id=NEW.order_item_id
    AND link.execution_type=NEW.execution_type
    AND link.id IS DISTINCT FROM NEW.id
    AND task.deleted_at IS NULL
    AND task.status NOT IN ('Hủy','Lưu trữ');

  IF allocated+NEW.planned_quantity>source_item.quantity THEN
    RAISE EXCEPTION 'Số lượng giao/lắp vượt quá số lượng còn lại của hạng mục';
  END IF;
  NEW.updated_at=NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_task_fulfillment_item ON task_order_fulfillment_items;
CREATE TRIGGER trigger_validate_task_fulfillment_item
  BEFORE INSERT OR UPDATE OF task_id,order_item_id,execution_type,planned_quantity,completed_quantity
  ON task_order_fulfillment_items FOR EACH ROW EXECUTE FUNCTION validate_task_fulfillment_item();

COMMIT;
