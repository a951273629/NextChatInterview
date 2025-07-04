// app/db/index.ts
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// 支持环境变量指定数据库路径，适配容器环境
const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "database", "nextchat.db");

// 确保数据库目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  console.log(`Creating database directory: ${dbDir}`);
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`Database path: ${DB_PATH}`);

// 创建数据库连接
const db = new Database(DB_PATH, {
  // 启用WAL模式以提高并发性能
  fileMustExist: false,
});

// 启用外键约束
db.pragma("foreign_keys = ON");

// 启用WAL模式
db.pragma("journal_mode = WAL");

// 加载表结构SQL文件路径
const noticeSchemaPath = path.join(process.cwd(), "app/db/update_notice.sql");
const userSystemSchemaPath = path.join(process.cwd(), "app/db/user_system_schema.sql");

// 加载通知系统表结构
if (fs.existsSync(noticeSchemaPath)) {
  const noticeSchema = fs.readFileSync(noticeSchemaPath, "utf8");
  db.exec(noticeSchema);
  console.log("Notice schema loaded successfully");
} else {
  console.warn(`Notice schema file not found at: ${noticeSchemaPath}`);
}

// 加载用户系统表结构
if (fs.existsSync(userSystemSchemaPath)) {
  const userSystemSchema = fs.readFileSync(userSystemSchemaPath, "utf8");
  db.exec(userSystemSchema);
  console.log("User system schema loaded successfully");
} else {
  console.warn(`User system schema file not found at: ${userSystemSchemaPath}`);
}

// 导出数据库实例供其他模块使用
export default db;
