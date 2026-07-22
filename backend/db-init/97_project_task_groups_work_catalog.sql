-- Simba PMS 2.6.0-B: Project Task Groups & Work Catalog
BEGIN;

INSERT INTO system_catalogs(catalog_type,code,name,sort_order,is_default,is_active) VALUES
  ('PROJECT_TYPE','SIGNAGE','Bảng hiệu',10,true,true),
  ('PROJECT_TYPE','DISPLAY_SHELF','Kệ trưng bày',20,false,true),
  ('PROJECT_TYPE','BOOTH','Booth',30,false,true),
  ('PROJECT_TYPE','STANDEE','Standee',40,false,true),
  ('PROJECT_TYPE','BACKDROP','Backdrop',50,false,true),
  ('PROJECT_TYPE','LIGHTBOX','Hộp đèn',60,false,true),
  ('PROJECT_TYPE','OTHER','Khác',900,false,true)
ON CONFLICT DO NOTHING;

INSERT INTO system_catalogs(catalog_type,code,name,sort_order,is_active)
SELECT 'PROJECT_TYPE', 'LEGACY_' || substr(md5(project_type),1,12), project_type, 800, true
FROM (SELECT DISTINCT trim(project_type) project_type FROM projects WHERE nullif(trim(project_type),'') IS NOT NULL) x
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS work_groups (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(30),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_items (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES work_groups(id) ON DELETE RESTRICT,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  default_estimated_hours NUMERIC(10,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_work_items_group_name UNIQUE(group_id,name),
  CONSTRAINT chk_work_items_default_hours CHECK(default_estimated_hours IS NULL OR default_estimated_hours >= 0)
);

CREATE TABLE IF NOT EXISTS work_item_project_types (
  work_item_id BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  project_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(work_item_id,project_type)
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_item_id BIGINT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tasks_work_item_id_fkey') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_work_item_id_fkey
      FOREIGN KEY(work_item_id) REFERENCES work_items(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_work_groups_active_order ON work_groups(is_active,sort_order,name);
CREATE INDEX IF NOT EXISTS idx_work_items_group_active_order ON work_items(group_id,is_active,sort_order,name);
CREATE INDEX IF NOT EXISTS idx_work_item_project_types_type ON work_item_project_types(project_type,work_item_id);
CREATE INDEX IF NOT EXISTS idx_tasks_work_item ON tasks(work_item_id);

DROP TRIGGER IF EXISTS update_work_groups_updated_at ON work_groups;
CREATE TRIGGER update_work_groups_updated_at BEFORE UPDATE ON work_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_work_items_updated_at ON work_items;
CREATE TRIGGER update_work_items_updated_at BEFORE UPDATE ON work_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO work_groups(code,name,description,sort_order) VALUES
  ('OFFICE','Văn phòng','Công việc thiết kế, chuẩn bị và giám sát',10),
  ('PRODUCTION','Sản xuất','Công việc gia công và hoàn thiện tại xưởng',20),
  ('INSTALLATION','Thi công','Công việc giao nhận và lắp đặt tại công trình',30)
ON CONFLICT DO NOTHING;

INSERT INTO work_items(group_id,code,name,default_estimated_hours,sort_order)
SELECT id,'DESIGN','Thiết kế',8,10 FROM work_groups WHERE code='OFFICE'
ON CONFLICT DO NOTHING;
INSERT INTO work_items(group_id,code,name,default_estimated_hours,sort_order)
SELECT id,'SUPERVISION','Giám sát',4,20 FROM work_groups WHERE code='OFFICE'
ON CONFLICT DO NOTHING;
INSERT INTO work_items(group_id,code,name,default_estimated_hours,sort_order)
SELECT id,'LIGHTBOX_FRAME','Khung hộp đèn',16,10 FROM work_groups WHERE code='PRODUCTION'
ON CONFLICT DO NOTHING;
INSERT INTO work_items(group_id,code,name,default_estimated_hours,sort_order)
SELECT id,'PAINTING','Sơn',8,20 FROM work_groups WHERE code='PRODUCTION'
ON CONFLICT DO NOTHING;
INSERT INTO work_items(group_id,code,name,default_estimated_hours,sort_order)
SELECT id,'DECAL_APPLICATION','Dán decal',8,30 FROM work_groups WHERE code='PRODUCTION'
ON CONFLICT DO NOTHING;
INSERT INTO work_items(group_id,code,name,default_estimated_hours,sort_order)
SELECT id,'DELIVERY','Giao hàng',4,10 FROM work_groups WHERE code='INSTALLATION'
ON CONFLICT DO NOTHING;
INSERT INTO work_items(group_id,code,name,default_estimated_hours,sort_order)
SELECT id,'ON_SITE_INSTALLATION','Lắp đặt',8,20 FROM work_groups WHERE code='INSTALLATION'
ON CONFLICT DO NOTHING;

INSERT INTO work_item_project_types(work_item_id,project_type)
SELECT wi.id,pt.name FROM work_items wi
CROSS JOIN system_catalogs pt
WHERE pt.catalog_type='PROJECT_TYPE' AND pt.is_active=true
  AND wi.code IN ('DESIGN','SUPERVISION','DELIVERY','ON_SITE_INSTALLATION')
ON CONFLICT DO NOTHING;

INSERT INTO work_item_project_types(work_item_id,project_type)
SELECT wi.id,pt.name FROM work_items wi
JOIN system_catalogs pt ON pt.catalog_type='PROJECT_TYPE' AND pt.name IN ('Bảng hiệu','Hộp đèn')
WHERE wi.code IN ('LIGHTBOX_FRAME','PAINTING','DECAL_APPLICATION')
ON CONFLICT DO NOTHING;

COMMIT;
