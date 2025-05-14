// test-db.ts
import db from "./index"; // 导入会触发初始化
import { getAllKeys } from "../services/KeyService"; // 使用服务

console.log("尝试连接数据库并获取所有密钥...");
try {
  const keys = getAllKeys();
  console.log("当前密钥数量:", keys.length);
  console.log("数据库初始化成功！");
  db.close(); // 测试完毕后可以关闭连接
} catch (e) {
  console.error("数据库操作失败:", e);
}
