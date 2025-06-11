// scripts/migrate-db.js
// 数据库迁移脚本
// 用于在现有项目中安全地添加暂停/恢复功能的数据库字段

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

// 支持环境变量指定数据库路径，适配容器环境
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "database", "nextchat.db");

console.log(`[迁移] 数据库路径: ${DB_PATH}`);

// 检查数据库文件是否存在
if (!fs.existsSync(DB_PATH)) {
  console.error(`[错误] 数据库文件不存在: ${DB_PATH}`);
  console.log("请确保应用已经运行过一次以创建数据库文件。");
  process.exit(1);
}

// 连接到数据库
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma("foreign_keys = ON");

// 启用WAL模式
db.pragma("journal_mode = WAL");

function main() {
  try {
    console.log("[迁移] 开始数据库迁移检查...");
    
    // 检查keys表是否已包含新字段
    const tableInfo = db.prepare("PRAGMA table_info(keys)").all();
    const columns = tableInfo.map(col => col.name);
    
    console.log(`[迁移] 当前keys表字段: ${columns.join(", ")}`);
    
    // 检查paused_at字段是否存在
    if (columns.includes("paused_at")) {
      console.log("[迁移] 数据库结构已是最新，无需迁移。");
      return;
    }
    
    console.log("[迁移] 检测到需要迁移，开始执行...");
    
    // 开始事务
    const migrate = db.transaction(() => {
      // 1. 重命名现有表
      console.log("[迁移] 步骤1: 重命名现有keys表为keys_old");
      db.exec("ALTER TABLE keys RENAME TO keys_old");
      
      // 2. 读取新的schema并创建新表
      console.log("[迁移] 步骤2: 创建新的keys表结构");
      const schemaPath = path.join(process.cwd(), "/schema.sql");
      
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`Schema文件不存在: ${schemaPath}`);
      }
      
      const schema = fs.readFileSync(schemaPath, "utf8");
      db.exec(schema);
      
      // 3. 复制数据从旧表到新表
      console.log("[迁移] 步骤3: 复制数据到新表");
      const copyStmt = db.prepare(`
        INSERT INTO keys (
          id, key_string, status, created_at, activated_at, expires_at, 
          activated_ip, hardware_name, duration_hours, notes
        ) 
        SELECT 
          id, key_string, status, created_at, activated_at, expires_at, 
          activated_ip, hardware_name, duration_hours, notes
        FROM keys_old
      `);
      
      const result = copyStmt.run();
      console.log(`[迁移] 已复制 ${result.changes} 条记录`);
      
      // 4. 删除旧表
      console.log("[迁移] 步骤4: 删除旧表");
      db.exec("DROP TABLE keys_old");
      
      console.log("[迁移] 数据库迁移成功完成！");
    });
    
    // 执行迁移事务
    migrate();
    
  } catch (error) {
    console.error("[错误] 数据库迁移失败:", error.message);
    console.error("详细错误:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// 如果是直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { main }; 