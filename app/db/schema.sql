-- app/db/schema.sql
CREATE TABLE IF NOT EXISTS keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_string TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  expires_at INTEGER NOT NULL,
  activated_ip TEXT,
  hardware_name TEXT
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_keys_key_string ON keys(key_string);
CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);