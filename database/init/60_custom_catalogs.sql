BEGIN;

CREATE TABLE IF NOT EXISTS system_catalogs (
  id BIGSERIAL PRIMARY KEY,
  catalog_type VARCHAR(50) NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  color VARCHAR(30),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_system_catalogs_type_code UNIQUE (catalog_type, code),
  CONSTRAINT uq_system_catalogs_type_name UNIQUE (catalog_type, name)
);
CREATE INDEX IF NOT EXISTS idx_system_catalogs_type_active_order
  ON system_catalogs(catalog_type, is_active, sort_order, name);

INSERT INTO system_catalogs(catalog_type,code,name,sort_order,is_default) VALUES
('TASK_TYPE','PRODUCTION','Sản xuất',10,true),
('TASK_TYPE','DELIVERY','Giao hàng',20,false),
('TASK_TYPE','INSTALLATION','Lắp đặt',30,false),
('SCHEDULE_TYPE','PRODUCTION','Sản xuất',10,true),
('SCHEDULE_TYPE','DELIVERY','Giao hàng',20,false),
('SCHEDULE_TYPE','INSTALLATION','Lắp đặt',30,false),
('SCHEDULE_TYPE','MEETING','Họp',40,false),
('DEPARTMENT','PRODUCTION','Sản xuất',10,true),
('DEPARTMENT','INSTALLATION','Lắp đặt',20,false),
('DEPARTMENT','DESIGN','Thiết kế',30,false),
('DEPARTMENT','ADMIN','Hành chính',40,false),
('EMPLOYEE_POSITION','WORKER','Công nhân',10,true),
('EMPLOYEE_POSITION','TEAM_LEADER','Tổ trưởng',20,false),
('EMPLOYEE_POSITION','TECHNICIAN','Kỹ thuật viên',30,false),
('EMPLOYEE_POSITION','DRIVER','Tài xế',40,false),
('EMPLOYEE_POSITION','MANAGER','Quản lý',50,false)
ON CONFLICT DO NOTHING;

-- Preserve legacy values already used in production.
INSERT INTO system_catalogs(catalog_type,code,name,sort_order)
SELECT 'DEPARTMENT', 'LEGACY_' || substr(md5(department),1,12), department, 900
FROM (SELECT DISTINCT trim(department) department FROM employees WHERE nullif(trim(department),'') IS NOT NULL) x
ON CONFLICT DO NOTHING;
INSERT INTO system_catalogs(catalog_type,code,name,sort_order)
SELECT 'EMPLOYEE_POSITION', 'LEGACY_' || substr(md5(position),1,12), position, 900
FROM (SELECT DISTINCT trim(position) position FROM employees WHERE nullif(trim(position),'') IS NOT NULL) x
ON CONFLICT DO NOTHING;
INSERT INTO system_catalogs(catalog_type,code,name,sort_order)
SELECT 'TASK_TYPE', 'LEGACY_' || substr(md5(task_type),1,12), task_type, 900
FROM (SELECT DISTINCT trim(task_type) task_type FROM tasks WHERE nullif(trim(task_type),'') IS NOT NULL) x
ON CONFLICT DO NOTHING;
INSERT INTO system_catalogs(catalog_type,code,name,sort_order)
SELECT 'SCHEDULE_TYPE', 'LEGACY_' || substr(md5(schedule_type),1,12), schedule_type, 900
FROM (SELECT DISTINCT trim(schedule_type) schedule_type FROM schedules WHERE nullif(trim(schedule_type),'') IS NOT NULL) x
ON CONFLICT DO NOTHING;

COMMIT;
