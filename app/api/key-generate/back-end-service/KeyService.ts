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
      if (key.paused_at) {
        key.paused_at = toJsTimestamp(key.paused_at);
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

    if (key.status === KeyStatus.REVOKED) {
      throw new Error("密钥已被撤销");
    }

    if (key.status === KeyStatus.PAUSED) {
      throw new Error("密钥已暂停，请先恢复");
    }

    // 如果密钥已经是激活状态，进入验证逻辑
    if (key.status === KeyStatus.ACTIVE) {
      // 验证硬件绑定：检查传入的硬件名称是否与已记录的硬件名称一致
      // if (key.hardware_name !== hardwareName) {
      //   throw new Error("密钥已在其他设备上激活，无法在当前设备上使用");
      // }
      // 硬件验证通过，直接返回密钥信息，不更新任何时间信息
      return key;
    }

    // 只有未激活状态的密钥才执行首次激活逻辑
    if (key.status === KeyStatus.INACTIVE) {
      // 激活密钥并计算过期时间
      const nowJs = Date.now();
      const now = toSqliteTimestamp(nowJs);

      // 计算过期时间 = 激活时间 + 卡密时长(hours)
      const expiresJs = nowJs + key.duration_hours * 60 * 60 * 1000;
      const expiresAt = toSqliteTimestamp(expiresJs);

      // 更新密钥状态，清理暂停相关字段
      const stmt = db.prepare(`
        UPDATE keys 
        SET status = ?, activated_at = ?, activated_ip = ?, hardware_name = ?, expires_at = ?, 
            paused_at = NULL, remaining_time_on_pause = NULL
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
    }

    // 如果密钥状态不是预期的状态，抛出错误
    throw new Error(`密钥状态异常: ${key.status}`);
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
      if (key.paused_at) {
        key.paused_at = toJsTimestamp(key.paused_at);
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
      if (key.paused_at) {
        key.paused_at = toJsTimestamp(key.paused_at);
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

    // 撤销密钥时清理暂停相关字段
    const stmt = db.prepare(`
      UPDATE keys 
      SET status = ?, paused_at = NULL, remaining_time_on_pause = NULL 
      WHERE key_string = ?
    `);
    stmt.run(KeyStatus.REVOKED, keyString);

    return getKeyByString(keyString);
  } catch (error) {
    console.error("撤销密钥失败:", error);
    throw new Error(`撤销密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 暂停密钥
 * @param keyString 密钥字符串
 * @returns 更新后的密钥对象
 */
export function pauseKey(keyString: string): Key | undefined {
  try {
    // 首先查询密钥是否存在
    const key = getKeyByString(keyString);

    if (!key) {
      throw new Error("密钥不存在");
    }

    if (key.status !== KeyStatus.ACTIVE) {
      throw new Error("只能暂停激活状态的密钥");
    }

    if (!key.expires_at) {
      throw new Error("密钥过期时间为空，无法暂停");
    }

    // 计算剩余时间（秒）
    const nowJs = Date.now();
    const nowSqlite = toSqliteTimestamp(nowJs);
    const remainingSeconds = Math.max(0, key.expires_at / 1000 - nowJs / 1000);

    // 更新密钥状态为暂停
    const stmt = db.prepare(`
      UPDATE keys 
      SET status = ?, paused_at = ?, remaining_time_on_pause = ?, expires_at = NULL
      WHERE key_string = ?
    `);

    stmt.run(
      KeyStatus.PAUSED,
      nowSqlite,
      remainingSeconds,
      keyString,
    );

    return getKeyByString(keyString);
  } catch (error) {
    console.error("暂停密钥失败:", error);
    throw new Error(`暂停密钥失败: ${(error as Error).message}`);
  }
}

/**
 * 恢复密钥
 * @param keyString 密钥字符串
 * @returns 更新后的密钥对象
 */
export function resumeKey(keyString: string): Key | undefined {
  try {
    // 首先查询密钥是否存在
    const key = getKeyByString(keyString);

    if (!key) {
      throw new Error("密钥不存在");
    }

    if (key.status !== KeyStatus.PAUSED) {
      throw new Error("只能恢复暂停状态的密钥");
    }

    if (!key.remaining_time_on_pause) {
      throw new Error("剩余时间为空，无法恢复");
    }

    // 计算新的过期时间
    const nowJs = Date.now();
    const newExpiresJs = nowJs + key.remaining_time_on_pause * 1000;
    const newExpiresAt = toSqliteTimestamp(newExpiresJs);

    // 更新密钥状态为激活
    const stmt = db.prepare(`
      UPDATE keys 
      SET status = ?, expires_at = ?, paused_at = NULL, remaining_time_on_pause = NULL
      WHERE key_string = ?
    `);

    stmt.run(
      KeyStatus.ACTIVE,
      newExpiresAt,
      keyString,
    );

    return getKeyByString(keyString);
  } catch (error) {
    console.error("恢复密钥失败:", error);
    throw new Error(`恢复密钥失败: ${(error as Error).message}`);
  }
}
