BEGIN;

-- Completion migration for 2.4.0-A. Keep 70_material_master_data.sql unchanged
-- because released migrations are checksum protected.

-- Ensure stock policy can never be enabled accidentally in this release.
UPDATE inventory_settings SET allow_negative_stock=false WHERE id=1;

-- A deactivated default warehouse must not prevent choosing another default.
-- This file is applied by both the PostgreSQL init hook and the backend migration
-- runner, so remove either version before creating the final index.
DROP INDEX IF EXISTS uq_warehouses_one_default;
DROP INDEX IF EXISTS uq_warehouses_one_active_default;
CREATE UNIQUE INDEX uq_warehouses_one_active_default
  ON warehouses (is_default) WHERE is_default=true AND is_active=true;

-- Seed configurable material-related catalogs used by Settings and forms.
INSERT INTO system_catalogs(catalog_type,code,name,description,sort_order,is_default,is_active)
VALUES
 ('WAREHOUSE_TYPE','MAIN','Kho chính','Kho lưu trữ chính',10,true,true),
 ('WAREHOUSE_TYPE','PRODUCTION','Kho sản xuất','Kho cấp vật tư cho sản xuất',20,false,true),
 ('WAREHOUSE_TYPE','SITE','Kho công trình','Kho tại địa điểm thi công',30,false,true),
 ('WAREHOUSE_TYPE','QUARANTINE','Kho chờ kiểm tra','Hàng chờ kiểm tra chất lượng',40,false,true),
 ('MATERIAL_BRAND','NO_BRAND','Không thương hiệu',NULL,10,true,true),
 ('STORAGE_CONDITION','NORMAL','Thông thường',NULL,10,true,true),
 ('STORAGE_CONDITION','DRY','Khô ráo',NULL,20,false,true),
 ('STORAGE_CONDITION','AVOID_SUNLIGHT','Tránh ánh sáng',NULL,30,false,true),
 ('STORAGE_CONDITION','COLD','Bảo quản lạnh',NULL,40,false,true),
 ('STOCK_ADJUSTMENT_REASON','OPENING_BALANCE','Số dư đầu kỳ',NULL,10,true,true),
 ('STOCK_ADJUSTMENT_REASON','COUNT_SURPLUS','Kiểm kê thừa',NULL,20,false,true),
 ('STOCK_ADJUSTMENT_REASON','COUNT_SHORTAGE','Kiểm kê thiếu',NULL,30,false,true),
 ('STOCK_ADJUSTMENT_REASON','DAMAGED','Hư hỏng',NULL,40,false,true),
 ('STOCK_ADJUSTMENT_REASON','EXPIRED','Hết hạn',NULL,50,false,true)
ON CONFLICT (catalog_type,code) DO UPDATE SET
 name=EXCLUDED.name,
 description=EXCLUDED.description,
 sort_order=EXCLUDED.sort_order,
 is_active=true,
 updated_at=NOW();

-- Normalize legacy material rows so Material Master Data is usable immediately.
UPDATE materials
SET name=COALESCE(NULLIF(BTRIM(name),''),NULLIF(BTRIM(material_name),''),material_code),
    description=COALESCE(description,notes),
    minimum_stock=GREATEST(COALESCE(minimum_stock,min_stock_level,0),0),
    reorder_point=GREATEST(COALESCE(reorder_point,0),0),
    standard_cost=GREATEST(COALESCE(standard_cost,unit_price,0),0),
    tracking_type=COALESCE(NULLIF(tracking_type,''),'NONE'),
    is_active=COALESCE(is_active,true)
WHERE deleted_at IS NULL;

-- Map legacy textual units to master units where possible; otherwise use PIECE.
UPDATE materials m
SET base_unit_id=u.id
FROM material_units u
WHERE m.base_unit_id IS NULL
  AND (LOWER(BTRIM(COALESCE(m.unit,'')))=LOWER(BTRIM(u.symbol))
       OR LOWER(BTRIM(COALESCE(m.unit,'')))=LOWER(BTRIM(u.name)));

UPDATE materials
SET base_unit_id=(SELECT id FROM material_units WHERE code='PIECE')
WHERE base_unit_id IS NULL;

-- Enforce non-negative master stock thresholds independently of future transactions.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='materials_reorder_levels_check') THEN
    ALTER TABLE materials ADD CONSTRAINT materials_reorder_levels_check CHECK (
      reorder_point >= 0 AND (maximum_stock IS NULL OR maximum_stock >= minimum_stock)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_material_unit_conversions_material_active
  ON material_unit_conversions(material_id) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS idx_warehouses_active
  ON warehouses(is_active,name);
CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON suppliers(is_active,name);

COMMIT;
