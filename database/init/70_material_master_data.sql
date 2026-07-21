BEGIN;

CREATE TABLE IF NOT EXISTS material_categories (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  parent_id INTEGER REFERENCES material_categories(id) ON DELETE SET NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_categories_name_active ON material_categories (LOWER(name)) WHERE is_active;

CREATE TABLE IF NOT EXISTS material_units (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(30) NOT NULL,
  decimal_precision INTEGER NOT NULL DEFAULT 2 CHECK (decimal_precision BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_units_name_active ON material_units (LOWER(name)) WHERE is_active;

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  supplier_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  tax_code VARCHAR(50),
  contact_name VARCHAR(120),
  phone VARCHAR(30),
  email VARCHAR(150),
  address_line TEXT,
  province_code VARCHAR(10),
  commune_code VARCHAR(20),
  payment_terms TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  warehouse_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  warehouse_type VARCHAR(80) NOT NULL DEFAULT 'Kho chính',
  location TEXT,
  manager_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_one_default ON warehouses (is_default) WHERE is_default;

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id SERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_code VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  zone VARCHAR(80),
  rack VARCHAR(80),
  shelf VARCHAR(80),
  bin VARCHAR(80),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, location_code)
);

CREATE TABLE IF NOT EXISTS inventory_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
  allow_negative_stock BOOLEAN NOT NULL DEFAULT false CHECK (allow_negative_stock = false),
  auto_generate_material_code BOOLEAN NOT NULL DEFAULT true,
  material_code_prefix VARCHAR(20) NOT NULL DEFAULT 'VT',
  material_code_digits INTEGER NOT NULL DEFAULT 5 CHECK (material_code_digits BETWEEN 3 AND 12),
  material_code_next_number BIGINT NOT NULL DEFAULT 1 CHECK (material_code_next_number > 0),
  inventory_cost_method VARCHAR(30) NOT NULL DEFAULT 'MOVING_AVERAGE' CHECK (inventory_cost_method = 'MOVING_AVERAGE'),
  quantity_decimal_precision INTEGER NOT NULL DEFAULT 3 CHECK (quantity_decimal_precision BETWEEN 0 AND 6),
  price_decimal_precision INTEGER NOT NULL DEFAULT 2 CHECK (price_decimal_precision BETWEEN 0 AND 6),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
INSERT INTO inventory_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE materials ADD COLUMN IF NOT EXISTS name VARCHAR(200);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES material_categories(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS base_unit_id INTEGER REFERENCES material_units(id) ON DELETE RESTRICT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS brand VARCHAR(120);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS specification TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS barcode VARCHAR(100);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS minimum_stock NUMERIC(18,6) NOT NULL DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(18,6) NOT NULL DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS maximum_stock NUMERIC(18,6);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS standard_cost NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS default_supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS tracking_type VARCHAR(30) NOT NULL DEFAULT 'NONE';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS storage_condition VARCHAR(120);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE materials SET name = COALESCE(name, material_name) WHERE name IS NULL;
UPDATE materials SET description = COALESCE(description, notes) WHERE description IS NULL;
UPDATE materials SET minimum_stock = COALESCE(NULLIF(minimum_stock, 0), min_stock_level, 0);
UPDATE materials SET standard_cost = COALESCE(NULLIF(standard_cost, 0), unit_price, 0);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='materials_tracking_type_check') THEN
    ALTER TABLE materials ADD CONSTRAINT materials_tracking_type_check CHECK (tracking_type IN ('NONE','BATCH','SERIAL','BATCH_EXPIRY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='materials_stock_levels_check') THEN
    ALTER TABLE materials ADD CONSTRAINT materials_stock_levels_check CHECK (
      minimum_stock >= 0 AND reorder_point >= 0 AND (maximum_stock IS NULL OR maximum_stock >= minimum_stock) AND standard_cost >= 0
    );
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_materials_sku ON materials (LOWER(sku)) WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_materials_barcode ON materials (barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category_id);
CREATE INDEX IF NOT EXISTS idx_materials_active ON materials(is_active) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS material_unit_conversions (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  from_unit_id INTEGER NOT NULL REFERENCES material_units(id) ON DELETE RESTRICT,
  to_unit_id INTEGER NOT NULL REFERENCES material_units(id) ON DELETE RESTRICT,
  conversion_factor NUMERIC(24,8) NOT NULL CHECK (conversion_factor > 0),
  is_purchase_unit BOOLEAN NOT NULL DEFAULT false,
  is_issue_unit BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (from_unit_id <> to_unit_id),
  UNIQUE(material_id, from_unit_id, to_unit_id)
);

-- Prepared for 2.4.0-B/C. No stock transactions are posted in 2.4.0-A.
CREATE TABLE IF NOT EXISTS inventory_batches (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  batch_number VARCHAR(100),
  serial_number VARCHAR(150),
  manufactured_date DATE,
  expiry_date DATE,
  quantity_on_hand NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_serial ON inventory_batches(material_id, serial_number) WHERE serial_number IS NOT NULL;

INSERT INTO material_categories(code,name,sort_order) VALUES
 ('RAW','Nguyên vật liệu',10),('COMPONENT','Linh kiện',20),('CONSUMABLE','Vật tư tiêu hao',30),('PACKAGING','Bao bì',40),('TOOL','Công cụ dụng cụ',50),('SEMI_FINISHED','Bán thành phẩm',60),('FINISHED','Thành phẩm',70)
ON CONFLICT (code) DO NOTHING;

INSERT INTO material_units(code,name,symbol,decimal_precision) VALUES
 ('PIECE','Cái','cái',0),('SET','Bộ','bộ',0),('BOX','Hộp','hộp',0),('CARTON','Thùng','thùng',0),('KILOGRAM','Kilogram','kg',3),('GRAM','Gram','g',2),('METER','Mét','m',3),('SQUARE_METER','Mét vuông','m²',3),('CUBIC_METER','Mét khối','m³',3),('LITER','Lít','l',3),('ROLL','Cuộn','cuộn',0),('SHEET','Tấm','tấm',0),('BAG','Bao','bao',0)
ON CONFLICT (code) DO NOTHING;

INSERT INTO warehouses(warehouse_code,name,warehouse_type,is_default) VALUES ('MAIN','Kho chính','Kho chính',true)
ON CONFLICT (warehouse_code) DO UPDATE SET is_default=true;
UPDATE inventory_settings SET default_warehouse_id=(SELECT id FROM warehouses WHERE warehouse_code='MAIN'), updated_at=NOW() WHERE id=1 AND default_warehouse_id IS NULL;

COMMIT;
