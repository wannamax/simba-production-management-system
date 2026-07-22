-- Simba PMS 2.6.0-F refinement: supervisor role for whole production workflow
INSERT INTO system_catalogs(catalog_type,code,name,description,sort_order,is_default,is_active)
VALUES('PROJECT_ROLE','PRODUCTION_SUPERVISOR','Giám sát','Theo dõi xuyên suốt Lệnh sản xuất và mọi công đoạn',25,false,true)
ON CONFLICT DO NOTHING;
