// app/services/keyService.ts
import db from "../../../db";
import { KeyStatus, Key } from "../../../constant";
// 添加 short-uuid 导入
import shortUuid from "short-uuid";

/**
 * 将JavaScript毫秒时间戳转换为SQLite秒级时间戳
 * @param jsTimestamp JavaScript毫秒时间戳
 * @returns SQLite秒级时间戳
 */
function toSqliteTimestamp(jsTimestamp: number): number {
  return Math.floor(jsTimestamp / 1000);
}

/**
 * 将SQLite秒级时间戳转换为JavaScript毫秒时间戳
 * @param sqliteTimestamp SQLite秒级时间戳
 * @returns JavaScript毫秒时间戳
 */
function toJsTimestamp(sqliteTimestamp: number): number {
  return sqliteTimestamp * 1000;
}

/**
 * 创建一个新密钥
 * @param expiresHours 密钥过期时间（小时），默认为2小时
 * @returns 创建的密钥对象
 */
export function createKey(expiresHours: number = 2, notes?: string): Key {
  try {
    // 生成密钥字符串
    const keyString = generateKeyString();

    // 计算创建时间戳
    const nowJs = Date.now();
    const now = toSqliteTimestamp(nowJs);

    // 不再预先计算过期时间，将在激活时计算
    const stmt = db.prepare(`
        INSERT INTO keys (key_string, status, created_at, expires_at, activated_at, activated_ip, hardware_name, duration_hours, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

    const info = stmt.run(
      keyString,
      KeyStatus.INACTIVE, // 默认设置为未激活状态
      now,
      null, // 过期时间现在设置为null，将在激活时计算
      null, // 激活时间初始为null
      null, // 激活IP初始为null
      null, // 硬件名称初始为null
      expiresHours, // 卡密时长
      notes || null, // 备注信息
    );

    // 返回创建的密钥对象
    return {
      id: info.lastInsertRowid as number,
      key_string: keyString,
      status: KeyStatus.INACTIVE,
      created_at: nowJs,
      expires_at: null, // 过期时间现在为null
      activated_at: null,
      activated_ip: null,
      hardware_name: null,
      duration_hours: expiresHours, // 添加卡密时长
      notes: notes || null,
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
    const key = stmt.get(keyString) as Key | undefined;

    // 将SQLite时间戳转换为JS时间戳
    if (key) {
      key.created_at = toJsTimestamp(key.created_at);
      if (key.expires_at) {
        key.expires_at = toJsTimestamp(key.expires_at);
      }
      if (key.activated_at) {
        key.activated_at = toJsTimestamp(key.activated_at);
      }
    }

    return key;
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
    // 首先查询密钥是否存在
    const key = getKeyByString(keyString);

    if (!key) {
      throw new Error("密钥不存在");
    }

    if (key.status === KeyStatus.EXPIRED) {
      throw new Error("密钥已过期");
    }

    // if (key.status === KeyStatus.ACTIVE) {
    //   throw new Error("密钥已激活");
    // }

    if (key.status === KeyStatus.REVOKED) {
      throw new Error("密钥已被撤销");
    }

    // 激活密钥并计算过期时间
    const nowJs = Date.now();
    const now = toSqliteTimestamp(nowJs);

    // 计算过期时间 = 激活时间 + 卡密时长(hours)
    const expiresJs = nowJs + key.duration_hours * 60 * 60 * 1000;
    const expiresAt = toSqliteTimestamp(expiresJs);

    const stmt = db.prepare(`
      UPDATE keys 
      SET status = ?, activated_at = ?, activated_ip = ?, hardware_name = ?, expires_at = ?
      WHERE key_string = ?
    `);

    stmt.run(
      KeyStatus.ACTIVE,
      now,
      ipAddress,
      hardwareName,
      expiresAt,
      keyString,
    );

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
    const now = toSqliteTimestamp(Date.now());

    // 查找所有已过期但状态不是EXPIRED的密钥
    // 需要确保只检查已设置了expires_at值的记录
    const stmt = db.prepare(`
      UPDATE keys 
      SET status = ?
      WHERE expires_at IS NOT NULL AND expires_at < ? AND status != ?
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
    const keys = stmt.all() as Key[];

    // 将SQLite时间戳转换为JS时间戳
    return keys.map((key) => {
      key.created_at = toJsTimestamp(key.created_at);
      if (key.expires_at) {
        key.expires_at = toJsTimestamp(key.expires_at);
      }
      if (key.activated_at) {
        key.activated_at = toJsTimestamp(key.activated_at);
      }
      return key;
    });
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
    const keys = stmt.all(status) as Key[];

    // 将SQLite时间戳转换为JS时间戳
    return keys.map((key) => {
      key.created_at = toJsTimestamp(key.created_at);
      if (key.expires_at) {
        key.expires_at = toJsTimestamp(key.expires_at);
      }
      if (key.activated_at) {
        key.activated_at = toJsTimestamp(key.activated_at);
      }
      return key;
    });
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

/**
 * 撤销密钥
 */
export function revokeKey(keyString: string): Key | undefined {
  try {
    const key = getKeyByString(keyString);

    if (!key) {
      throw new Error("密钥不存在");
    }

    const stmt = db.prepare("UPDATE keys SET status = ? WHERE key_string = ?");
    stmt.run(KeyStatus.REVOKED, keyString);

    return getKeyByString(keyString);
  } catch (error) {
    console.error("撤销密钥失败:", error);
    throw new Error(`撤销密钥失败: ${(error as Error).message}`);
  }
}
