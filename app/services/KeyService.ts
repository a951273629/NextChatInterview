// app/services/keyService.ts
import db from "../db";
import { KeyStatus, Key } from "../constant";
// 添加 short-uuid 导入
import shortUuid from "short-uuid";

/**
 * 创建一个新密钥
 * @param expiresHours 密钥过期时间（小时），默认为2小时
 * @returns 创建的密钥对象
 */
export function createKey(expiresHours: number = 2): Key {
  try {
    // 生成密钥字符串
    const keyString = generateKeyString();

    // 计算时间戳
    const now = Date.now();
    const expiresAt = now + expiresHours * 60 * 60 * 1000; // 转换小时为毫秒

    const stmt = db.prepare(`
        INSERT INTO keys (key_string, status, created_at, expires_at, activated_at, activated_ip, hardware_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

    const info = stmt.run(
      keyString,
      KeyStatus.INACTIVE, // 默认设置为未激活状态
      now,
      expiresAt,
      null, // 激活时间初始为null
      null, // 激活IP初始为null
      null, // 硬件名称初始为null
    );

    // 返回创建的密钥对象
    return {
      id: info.lastInsertRowid as number,
      key_string: keyString,
      status: KeyStatus.INACTIVE,
      created_at: now,
      expires_at: expiresAt,
      activated_at: null,
      activated_ip: null,
      hardware_name: null,
    };
  } catch (error) {
    console.error("创建密钥失败:", error);
    throw new Error(`创建密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 通过密钥字符串查找密钥
 */
export function getKeyByString(keyString: string): Key | undefined {
  try {
    const stmt = db.prepare("SELECT * FROM keys WHERE key_string = ?");
    return stmt.get(keyString) as Key | undefined;
  } catch (error) {
    console.error("查询密钥失败:", error);
    throw new Error(`查询密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 激活密钥
 */
export function activateKey(
  keyString: string,
  ipAddress: string,
  hardwareName: string,
): Key | undefined {
  try {
    // 首先查询密钥是否存在并且未过期
    const key = getKeyByString(keyString);

    if (!key) {
      throw new Error("密钥不存在");
    }

    if (key.status === KeyStatus.EXPIRED) {
      throw new Error("密钥已过期");
    }

    if (key.status === KeyStatus.ACTIVE) {
      throw new Error("密钥已激活");
    }

    // 检查密钥是否已过期
    const now = Date.now();
    if (key.expires_at < now) {
      // 更新状态为已过期
      const updateStmt = db.prepare(`
        UPDATE keys SET status = ? WHERE key_string = ?
      `);
      updateStmt.run(KeyStatus.EXPIRED, keyString);
      throw new Error("密钥已过期");
    }

    // 激活密钥
    const stmt = db.prepare(`
      UPDATE keys 
      SET status = ?, activated_at = ?, activated_ip = ?, hardware_name = ?
      WHERE key_string = ?
    `);

    stmt.run(KeyStatus.ACTIVE, now, ipAddress, hardwareName, keyString);

    return getKeyByString(keyString);
  } catch (error) {
    console.error("激活密钥失败:", error);
    throw new Error(`激活密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 检查并更新所有过期的密钥
 */
export function updateExpiredKeys(): number {
  try {
    const now = Date.now();

    // 查找所有已过期但状态不是EXPIRED的密钥
    const stmt = db.prepare(`
      UPDATE keys 
      SET status = ?
      WHERE expires_at < ? AND status != ?
    `);

    const result = stmt.run(KeyStatus.EXPIRED, now, KeyStatus.EXPIRED);
    return result.changes;
  } catch (error) {
    console.error("更新过期密钥失败:", error);
    throw new Error(`更新过期密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 获取所有密钥
 */
export function getAllKeys(): Key[] {
  try {
    const stmt = db.prepare("SELECT * FROM keys ORDER BY created_at DESC");
    return stmt.all() as Key[];
  } catch (error) {
    console.error("获取所有密钥失败:", error);
    throw new Error(`获取所有密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 按状态获取密钥
 */
export function getKeysByStatus(status: KeyStatus): Key[] {
  try {
    const stmt = db.prepare(
      "SELECT * FROM keys WHERE status = ? ORDER BY created_at DESC",
    );
    return stmt.all(status) as Key[];
  } catch (error) {
    console.error(`获取${status}状态密钥失败:`, error);
    throw new Error(`获取${status}状态密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 生成随机密钥字符串
 * @param translator 可选的自定义翻译器，默认使用 flickrBase58
 * @returns 生成的短 UUID 字符串
 */
export function generateKeyString(translator?: shortUuid.Translator): string {
  // 使用默认的 flickrBase58 编码器或提供的自定义翻译器
  const uuidGenerator = translator || shortUuid();

  // 生成短 UUID
  return uuidGenerator.generate();
}

/**
 * 删除密钥
 */
export function deleteKey(keyString: string): boolean {
  try {
    const stmt = db.prepare("DELETE FROM keys WHERE key_string = ?");
    const result = stmt.run(keyString);
    return result.changes > 0;
  } catch (error) {
    console.error("删除密钥失败:", error);
    throw new Error(`删除密钥失败: ${(error as Error).message}`);
  }
}
