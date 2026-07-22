BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS province_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS commune_code VARCHAR(5);

UPDATE customers
SET address = CONCAT_WS(', ', NULLIF(BTRIM(address), ''), NULLIF(BTRIM(district), ''), NULLIF(BTRIM(city), ''))
WHERE NULLIF(BTRIM(district), '') IS NOT NULL OR NULLIF(BTRIM(city), '') IS NOT NULL;

ALTER TABLE customers
  DROP COLUMN IF EXISTS district,
  DROP COLUMN IF EXISTS city;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS province_code VARCHAR(2),
  ADD COLUMN IF NOT EXISTS commune_code VARCHAR(5);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_province_code_fkey') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_province_code_fkey
      FOREIGN KEY (province_code) REFERENCES administrative_provinces(code) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customers_commune_code_fkey') THEN
    ALTER TABLE customers ADD CONSTRAINT customers_commune_code_fkey
      FOREIGN KEY (commune_code) REFERENCES administrative_communes(code) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_province_code_fkey') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_province_code_fkey
      FOREIGN KEY (province_code) REFERENCES administrative_provinces(code) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_commune_code_fkey') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_commune_code_fkey
      FOREIGN KEY (commune_code) REFERENCES administrative_communes(code) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_administrative ON customers(province_code,commune_code);
CREATE INDEX IF NOT EXISTS idx_employees_administrative ON employees(province_code,commune_code);

COMMIT;
