BEGIN;

ALTER TABLE inventory_settings
  ADD COLUMN IF NOT EXISTS document_number_digits INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS require_reason_for_adjustment BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inventory_settings_document_digits_check') THEN
    ALTER TABLE inventory_settings ADD CONSTRAINT inventory_settings_document_digits_check
      CHECK (document_number_digits BETWEEN 4 AND 10);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_document_sequences (
  document_type VARCHAR(30) NOT NULL,
  sequence_year INTEGER NOT NULL,
  next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number > 0),
  PRIMARY KEY(document_type, sequence_year)
);

CREATE TABLE IF NOT EXISTS inventory_documents (
  id BIGSERIAL PRIMARY KEY,
  document_code VARCHAR(50) NOT NULL UNIQUE,
  document_type VARCHAR(30) NOT NULL CHECK (document_type IN (
    'OPENING_BALANCE','RECEIPT','ISSUE','RETURN_IN','ADJUSTMENT_IN','ADJUSTMENT_OUT','REVERSAL'
  )),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED','CANCELLED')),
  document_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  reference_number VARCHAR(100),
  reason_code VARCHAR(80),
  notes TEXT,
  idempotency_key VARCHAR(100) UNIQUE,
  reversal_of_document_id BIGINT UNIQUE REFERENCES inventory_documents(id) ON DELETE RESTRICT,
  total_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reversed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_inventory_documents_date_type ON inventory_documents(document_date DESC,document_type);
CREATE INDEX IF NOT EXISTS idx_inventory_documents_warehouse_status ON inventory_documents(warehouse_id,status);

CREATE TABLE IF NOT EXISTS inventory_document_lines (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES inventory_documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  input_unit_id INTEGER NOT NULL REFERENCES material_units(id) ON DELETE RESTRICT,
  input_quantity NUMERIC(18,6) NOT NULL CHECK (input_quantity > 0),
  conversion_factor NUMERIC(24,8) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  base_quantity NUMERIC(18,6) NOT NULL CHECK (base_quantity > 0),
  input_unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (input_unit_cost >= 0),
  base_unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (base_unit_cost >= 0),
  total_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  stock_direction SMALLINT NOT NULL CHECK (stock_direction IN (-1,1)),
  batch_number VARCHAR(100),
  serial_number VARCHAR(150),
  manufactured_date DATE,
  expiry_date DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id,line_number)
);
CREATE INDEX IF NOT EXISTS idx_inventory_document_lines_material ON inventory_document_lines(material_id);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES inventory_documents(id) ON DELETE RESTRICT,
  document_line_id BIGINT NOT NULL REFERENCES inventory_document_lines(id) ON DELETE RESTRICT,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transaction_type VARCHAR(30) NOT NULL,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  stock_direction SMALLINT NOT NULL CHECK (stock_direction IN (-1,1)),
  base_quantity NUMERIC(18,6) NOT NULL CHECK (base_quantity > 0),
  unit_cost NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  total_cost NUMERIC(18,4) NOT NULL CHECK (total_cost >= 0),
  balance_quantity_after NUMERIC(18,6) NOT NULL CHECK (balance_quantity_after >= 0),
  average_cost_after NUMERIC(18,4) NOT NULL CHECK (average_cost_after >= 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_line_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_material_date ON inventory_transactions(material_id,transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_warehouse_date ON inventory_transactions(warehouse_id,transaction_date DESC);

CREATE OR REPLACE FUNCTION prevent_inventory_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Sổ giao dịch kho là bất biến; hãy tạo phiếu đảo';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_transactions_immutable ON inventory_transactions;
CREATE TRIGGER trg_inventory_transactions_immutable
BEFORE UPDATE OR DELETE ON inventory_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_ledger_mutation();

INSERT INTO system_catalogs(catalog_type,code,name,description,sort_order,is_default,is_active)
VALUES
 ('STOCK_ADJUSTMENT_REASON','OPENING_BALANCE','Số dư đầu kỳ','Khởi tạo tồn kho đầu kỳ',10,true,true),
 ('STOCK_ADJUSTMENT_REASON','PURCHASE_RECEIPT','Nhập mua hàng',NULL,20,false,true),
 ('STOCK_ADJUSTMENT_REASON','PRODUCTION_ISSUE','Xuất sản xuất',NULL,30,false,true),
 ('STOCK_ADJUSTMENT_REASON','RETURN_UNUSED','Trả vật tư chưa sử dụng',NULL,40,false,true),
 ('STOCK_ADJUSTMENT_REASON','COUNT_SURPLUS','Kiểm kê thừa',NULL,50,false,true),
 ('STOCK_ADJUSTMENT_REASON','COUNT_SHORTAGE','Kiểm kê thiếu',NULL,60,false,true),
 ('STOCK_ADJUSTMENT_REASON','DAMAGED','Hư hỏng',NULL,70,false,true),
 ('STOCK_ADJUSTMENT_REASON','DATA_CORRECTION','Điều chỉnh dữ liệu',NULL,80,false,true)
ON CONFLICT (catalog_type,code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
  sort_order=EXCLUDED.sort_order,is_active=true,updated_at=NOW();

COMMIT;
