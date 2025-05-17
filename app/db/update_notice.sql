-- app/db/update_notice.sql
-- 通知系统数据库结构
-- 用于存储系统通知信息

-- 通知表：存储通知内容和标题
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- 唯一标识符
  title TEXT NOT NULL,                 -- 通知标题
  content TEXT NOT NULL,               -- 通知内容
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), -- 创建时间戳
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')), -- 更新时间戳
  is_active BOOLEAN NOT NULL DEFAULT 1 -- 是否激活显示
);

-- 索引：提高查询性能
CREATE INDEX IF NOT EXISTS idx_notices_is_active ON notices(is_active);
CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices(created_at); 