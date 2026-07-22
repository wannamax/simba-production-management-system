-- Simba PMS 2.6.0-C: Project Workspace & Assignment Sync
BEGIN;

INSERT INTO system_catalogs(catalog_type,code,name,description,sort_order,is_default,is_active) VALUES
  ('PROJECT_ROLE','PROJECT_MANAGER','Quản lý dự án','Phụ trách điều phối chung dự án',10,false,true),
  ('PROJECT_ROLE','PRODUCTION_LEAD','Trưởng nhóm sản xuất','Phụ trách nhóm sản xuất',20,false,true),
  ('PROJECT_ROLE','INSTALLATION_LEAD','Trưởng nhóm lắp đặt','Phụ trách nhóm thi công, lắp đặt',30,false,true),
  ('PROJECT_ROLE','DESIGNER','Thiết kế','Thực hiện công việc thiết kế',40,false,true),
  ('PROJECT_ROLE','PRODUCTION_WORKER','Thợ sản xuất','Thực hiện công việc sản xuất',50,false,true),
  ('PROJECT_ROLE','INSTALLER','Thợ lắp đặt','Thực hiện công việc thi công, lắp đặt',60,false,true),
  ('PROJECT_ROLE','MEMBER','Thành viên','Vai trò mặc định trong dự án',900,true,true)
ON CONFLICT DO NOTHING;

INSERT INTO system_catalogs(catalog_type,code,name,description,sort_order,is_active)
SELECT 'PROJECT_ROLE','LEGACY_' || substr(md5(role),1,12),role,'Vai trò từ dữ liệu dự án trước 2.6.0-C',800,true
FROM (
  SELECT DISTINCT trim(role) role FROM project_assignments WHERE nullif(trim(role),'') IS NOT NULL
  UNION
  SELECT DISTINCT trim(role_in_task) role FROM task_assignments WHERE nullif(trim(role_in_task),'') IS NOT NULL
) legacy
ON CONFLICT DO NOTHING;

COMMIT;
