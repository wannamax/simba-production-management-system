CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(32) PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations(version, description)
VALUES ('2.1.0', 'Clean consolidated Simba PMS schema')
ON CONFLICT (version) DO NOTHING;
