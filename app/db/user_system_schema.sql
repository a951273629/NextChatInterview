-- 微信用户系统数据库表结构

-- 1. 用户表 (users)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  openid VARCHAR(128) UNIQUE NOT NULL,        -- 微信用户唯一标识
  nickname VARCHAR(100),                      -- 用户昵称(可空)
  avatar_url TEXT,                           -- 头像URL(可空)
  balance INTEGER DEFAULT 0,                 -- 余额(积分)
  status VARCHAR(20) DEFAULT 'active',       -- 用户状态: active/inactive/banned
  is_activated BOOLEAN DEFAULT FALSE,        -- 是否激活(决定是否每分钟扣费)
  activated_at TIMESTAMP,                    -- 激活时间
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 充值密钥表 (recharge_keys)
CREATE TABLE IF NOT EXISTS recharge_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_string VARCHAR(64) UNIQUE NOT NULL,    -- 密钥字符串
  amount INTEGER NOT NULL,                   -- 充值金额(积分)
  status VARCHAR(20) DEFAULT 'active',       -- 密钥状态: active/used/revoked
  expires_at TIMESTAMP,                     -- 过期时间
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT                                -- 备注信息
);

-- 3. 充值记录表 (recharge_records)
CREATE TABLE IF NOT EXISTS recharge_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,                  -- 关联用户ID
  key_id INTEGER,                            -- 关联密钥ID(可为空,微信支付等其他充值方式)
  amount INTEGER NOT NULL,                   -- 充值金额
  recharge_type VARCHAR(20) NOT NULL,        -- 充值类型: key/wechat/admin
  status VARCHAR(20) DEFAULT 'success',      -- 状态: success/failed/pending
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (key_id) REFERENCES recharge_keys(id)
);

-- 4. 消费记录表 (consumption_records)
CREATE TABLE IF NOT EXISTS consumption_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,                  -- 关联用户ID
  amount INTEGER NOT NULL,                   -- 消费金额
  consume_type VARCHAR(20) NOT NULL,         -- 消费类型: time/chat/mcp
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_openid ON users(openid);
CREATE INDEX IF NOT EXISTS idx_recharge_keys_status ON recharge_keys(status);
CREATE INDEX IF NOT EXISTS idx_recharge_records_user_id ON recharge_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consumption_records_user_id ON consumption_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consumption_records_type ON consumption_records(consume_type); 