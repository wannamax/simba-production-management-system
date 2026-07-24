-- Protect work items that are structural to assignment and execution logic.

ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO work_items(group_id,code,name,description,default_estimated_hours,execution_type,sort_order,is_active,is_system)
SELECT id,'SUPERVISION','Giám sát & Quản lý','Công việc giám sát và quản lý xuyên suốt Quy trình',4,NULL,0,true,true
FROM work_groups WHERE code='OFFICE'
ON CONFLICT(code) DO UPDATE SET
  group_id=EXCLUDED.group_id,name=EXCLUDED.name,description=EXCLUDED.description,
  execution_type=NULL,sort_order=0,is_active=true,is_system=true;

INSERT INTO work_items(group_id,code,name,description,default_estimated_hours,execution_type,sort_order,is_active,is_system)
SELECT id,'DELIVERY','Giao hàng','Công việc hệ thống liên kết danh sách địa chỉ giao hàng',4,'DELIVERY',10,true,true
FROM work_groups WHERE code='INSTALLATION'
ON CONFLICT(code) DO UPDATE SET
  group_id=EXCLUDED.group_id,name=EXCLUDED.name,description=EXCLUDED.description,
  execution_type='DELIVERY',sort_order=10,is_active=true,is_system=true;

INSERT INTO work_items(group_id,code,name,description,default_estimated_hours,execution_type,sort_order,is_active,is_system)
SELECT id,'ON_SITE_INSTALLATION','Lắp đặt','Công việc hệ thống liên kết danh sách địa chỉ lắp đặt',8,'INSTALLATION',20,true,true
FROM work_groups WHERE code='INSTALLATION'
ON CONFLICT(code) DO UPDATE SET
  group_id=EXCLUDED.group_id,name=EXCLUDED.name,description=EXCLUDED.description,
  execution_type='INSTALLATION',sort_order=20,is_active=true,is_system=true;

INSERT INTO work_item_project_types(work_item_id,project_type)
SELECT wi.id,project_type.name
FROM work_items wi
CROSS JOIN system_catalogs project_type
WHERE wi.code IN ('SUPERVISION','DELIVERY','ON_SITE_INSTALLATION')
  AND project_type.catalog_type='PROJECT_TYPE' AND project_type.is_active=true
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION protect_system_work_item()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'Công việc hệ thống không thể xóa';
    END IF;
    IF NEW.code IS DISTINCT FROM OLD.code
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.group_id IS DISTINCT FROM OLD.group_id
      OR NEW.execution_type IS DISTINCT FROM OLD.execution_type
      OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      OR NEW.is_active IS DISTINCT FROM TRUE
      OR NEW.is_system IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Công việc hệ thống được ghi cứng và không thể thay đổi';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_system_work_item_trigger ON work_items;
CREATE TRIGGER protect_system_work_item_trigger
BEFORE UPDATE OR DELETE ON work_items
FOR EACH ROW EXECUTE FUNCTION protect_system_work_item();
