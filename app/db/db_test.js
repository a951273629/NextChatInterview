const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "database", "nextchat.db");
console.log("数据库路径:", DB_PATH);

try {
  // 确保数据库目录存在
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log("创建数据库目录:", dbDir);
  }

  // 尝试删除现有数据库文件
  if (fs.existsSync(DB_PATH)) {
    console.log("删除现有数据库文件...");
    try {
      // 先尝试连接并删除表
      const tempDb = new Database(DB_PATH);
      try {
        // 删除现有表
        tempDb.exec("DROP TABLE IF EXISTS keys;");
        console.log("成功删除现有表");
      } catch (dropErr) {
        console.warn("删除表失败:", dropErr.message);
      }
      tempDb.close();
    } catch (dbErr) {
      console.warn("无法连接到现有数据库:", dbErr.message);
    }

    // 如果表删除失败，尝试直接删除文件
    try {
      fs.unlinkSync(DB_PATH);
      console.log("成功删除数据库文件");
    } catch (unlinkErr) {
      console.warn("删除数据库文件失败:", unlinkErr.message);
      // 继续执行，可能会覆盖现有数据库
    }
  }

  // 创建新的数据库连接
  console.log("创建新数据库...");
  const db = new Database(DB_PATH);

  const sqlFile = process.argv[2] || "app/db/schema.sql";
  console.log(`执行SQL文件: ${sqlFile}`);

  // 读取SQL文件并确保使用UTF-8编码无BOM
  let sqlContent = fs.readFileSync(path.join(process.cwd(), sqlFile), {
    encoding: "utf8",
  });

  // 移除潜在的BOM标记
  if (sqlContent.charCodeAt(0) === 0xfeff) {
    console.log("检测到BOM标记，已移除");
    sqlContent = sqlContent.slice(1);
  }

  // 安全执行SQL语句
  const statements = sqlContent.split(";").filter((stmt) => stmt.trim());

  for (const statement of statements) {
    if (!statement.trim()) continue;

    try {
      db.exec(statement + ";");
      console.log(
        "执行成功:",
        statement.substring(0, 50) + (statement.length > 50 ? "..." : ""),
      );
    } catch (err) {
      // 详细记录错误信息
      console.error("执行SQL语句失败:", err.message);
      console.error("错误代码:", err.code);
      console.error("语句:", statement);

      // 如果不是列已存在的错误，则抛出
      if (!err.message.includes("duplicate column name")) {
        throw err;
      } else {
        console.log("忽略错误 (列已存在)");
      }
    }
  }

  // 验证表是否创建成功
  try {
    const tableInfo = db.prepare("PRAGMA table_info(keys)").all();
    console.log("表创建成功，列数:", tableInfo.length);
  } catch (err) {
    console.error("验证表结构失败:", err.message);
  }

  console.log("数据库更新成功!");
  db.close();
} catch (error) {
  console.error("数据库更新失败:", error.message);
  if (error.stack) {
    console.error("错误堆栈:", error.stack);
  }
  process.exit(1);
}
