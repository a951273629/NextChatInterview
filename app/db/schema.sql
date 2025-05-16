-- app/db/schema.sql 
-- 密钥管理系统数据库结构
-- 用于存储和管理软件许可密钥

-- 主表：存储所有密钥信息
CREATE TABLE IF NOT EXISTS keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- 唯一标识符
  key_string TEXT NOT NULL UNIQUE,      -- 密钥字符串，全局唯一
  status TEXT NOT NULL CHECK(status IN ('active', 'inactive', 'expired', 'revoked')), -- 密钥状态
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), -- 创建时间戳(Unix时间)
  activated_at INTEGER,                 -- 激活时间戳(Unix时间)
  expires_at INTEGER,                   -- 过期时间戳(Unix时间)，激活时才设置
  activated_ip TEXT,                    -- 激活设备的IP地址
  hardware_name TEXT,                   -- 激活设备的硬件名称
  duration_hours INTEGER DEFAULT 24 NOT NULL, -- 密钥有效时长(小时)
  notes TEXT                            -- 附加备注信息
);

-- 索引：提高查询性能
CREATE INDEX IF NOT EXISTS idx_keys_key_string ON keys(key_string);
CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);
CREATE INDEX IF NOT EXISTS idx_keys_expires_at ON keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_keys_status_expires ON keys(status, expires_at); -- 组合索引用于过滤查询 