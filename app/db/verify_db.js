const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(process.cwd(), "database", "nextchat.db");
console.log("数据库路径:", DB_PATH);

try {
  const db = new Database(DB_PATH);

  // 获取表信息
  const tableInfo = db.prepare("PRAGMA table_info(keys)").all();
  console.log("表结构信息:");
  tableInfo.forEach((column) => {
    console.log(
      `- ${column.name} (${column.type})${column.notnull ? " NOT NULL" : ""}${
        column.pk ? " PRIMARY KEY" : ""
      }`,
    );
  });

  // 获取索引信息
  const indexList = db.prepare("PRAGMA index_list(keys)").all();
  console.log("\n索引信息:");
  indexList.forEach((index) => {
    console.log(`- ${index.name}`);
    const indexInfo = db.prepare(`PRAGMA index_info(${index.name})`).all();
    indexInfo.forEach((col) => {
      console.log(`  > 列 ${col.seqno}: ${col.name}`);
    });
  });

  db.close();
  console.log("\n验证成功!");
} catch (error) {
  console.error("验证失败:", error.message);
  if (error.stack) {
    console.error("错误堆栈:", error.stack);
  }
}
