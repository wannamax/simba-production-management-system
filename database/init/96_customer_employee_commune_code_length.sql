-- Hotfix: current administrative commune codes contain 8 characters.
BEGIN;

ALTER TABLE customers
  ALTER COLUMN commune_code TYPE VARCHAR(8);

ALTER TABLE employees
  ALTER COLUMN commune_code TYPE VARCHAR(8);

COMMIT;
