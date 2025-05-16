// app/db/index.ts
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "nextchat.db");

// 确保数据库目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(DB_PATH, {
  // 启用WAL模式以提高并发性能
  fileMustExist: false,
});

// 启用外键约束
db.pragma("foreign_keys = ON");

// 启用WAL模式
db.pragma("journal_mode = WAL");

// 执行schema.sql中的表创建语句
const schema = fs.readFileSync(
  path.join(process.cwd(), "app/db/schema.sql"),
  "utf8",
);

// const schema_update = fs.readFileSync(
//   path.join(process.cwd(), "app/db/update_field.sql"),
//   "utf8",
// );
db.exec(schema);
// db.exec(schema_update);
// 导出数据库实例供其他模块使用
export default db;
