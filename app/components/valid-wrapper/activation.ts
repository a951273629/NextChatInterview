import { safeLocalStorage } from "../../utils";
import { getKeyByString } from "../../services/keyService";
// 导出以便其他组件使用
export { safeLocalStorage };

export const ACTIVATION_KEY = "user_activation_status";
export const ACTIVATION_HARDWARE = "user_activation_hardware";
export const ACTIVATION_IP = "user_activation_ip";
export const ACTIVATION_EXPIRY = "user_activation_expiry";
export const ACTIVATION_KEY_STRING = "user_activation_key_string";
export const LAST_SYNC_TIME = "user_activation_last_sync";
export const SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟，单位：毫秒
export const FIRST_SYNC_DELAY = 5 * 1000; // 首次同步延迟：5秒
export const EXPIRY_BUFFER_TIME = 5000; // 过期时间缓冲：5秒
export const INIT_DELAY = 100; // 初始化延迟：100毫秒

// 定义API响应类型
interface KeyApiResponse {
  status: "active" | "expired" | "revoked" | "paused" | "inactive";
  expires_at?: number;
  key_string?: string;
  [key: string]: any;
}

// 会话管理类型
interface SyncSession {
  id: string;
  timestamp: number;
}

const localStorage = safeLocalStorage();
let syncIntervalId: NodeJS.Timeout | null = null;
let firstSyncTimeoutId: NodeJS.Timeout | null = null;

// 会话管理：防止异步竞态条件
let currentSyncSession: SyncSession | null = null;
let isSyncInProgress = false;

/**
 * 检查用户是否已激活
 * @returns 用户是否已激活 激活返回true 未激活返回false
 */
export function isActivated(): boolean {
  try {
    // 从localStorage获取激活状态
    const status = localStorage.getItem(ACTIVATION_KEY);
    if (!status) return false;

    // 检查过期时间
    const expiryTime = localStorage.getItem(ACTIVATION_EXPIRY);
    console.log(`expiryTime:${expiryTime}`);

    if (expiryTime) {
      const expiryTimestamp = parseInt(expiryTime, 10);
      // 添加缓冲时间，避免时间精度问题导致刚激活就被判定为过期
      if (Date.now() > expiryTimestamp + EXPIRY_BUFFER_TIME) {
        // 如果已过期，记录日志但不调用clearActivation以避免潜在的递归
        console.log("激活已过期");
        // 仅返回未激活状态，让调用者处理清理工作
        return false;
      }
    }

    return status === "active";
  } catch (error) {
    console.error("检查激活状态失败:", error);
    return false;
  }
}

/**
 * 检查密钥是否处于暂停状态
 * @returns 是否为暂停状态
 */
export function isPaused(): boolean {
  try {
    // 从localStorage获取激活状态和密钥字符串
    const status = localStorage.getItem(ACTIVATION_KEY);
    const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
    
    // 只有在有密钥字符串且状态为paused时才认为是暂停状态
    return status === "paused" && !!keyString;
  } catch (error) {
    console.error("检查暂停状态失败:", error);
    return false;
  }
}

/**
 * 获取剩余激活时间（毫秒）- 安全版本
 * 定期与服务器同步以防止本地篡改
 * @returns 剩余时间（毫秒），如果未激活则返回0
 */
export function getRemainingTime(): number {
  try {
    const status = localStorage.getItem(ACTIVATION_KEY);
    if (status !== "active") return 0;

    // 获取过期时间
    const expiryTime = localStorage.getItem(ACTIVATION_EXPIRY);
    if (!expiryTime) return 0;

    const expiryTimestamp = parseInt(expiryTime, 10);
    const remainingTime = expiryTimestamp - Date.now();

    // 添加缓冲时间，避免时间精度问题导致刚激活就被判定为过期
    if (remainingTime <= -1000) {
      console.log("剩余时间检测为负值，清除激活状态", remainingTime);
      clearActivation();
      return 0;
    }

    return Math.max(0, remainingTime);
  } catch (error) {
    console.error("获取剩余时间失败:", error);
    return 0;
  }
}

/**
 * 格式化剩余时间为数字形式
 * @param remainingMs 剩余毫秒数
 * @returns 格式化后的时间数字（大于等于1分钟返回分钟数，小于1分钟返回秒数）
 */
export function formatRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) return "0";

  const seconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes >= 1) {
    return minutes.toString();
  } else {
    return seconds.toString();
  }
}

/**
 * 设置用户激活状态
 * @param keyString 激活密钥
 * @param expiresAt 过期时间戳
 * @param ipAddress IP地址
 * @param hardwareName 硬件信息
 */
export function setActivated(
  keyString: string,
  expiresAt: number,
  ipAddress: string,
  hardwareName: string,
): void {
  try {
    localStorage.setItem(ACTIVATION_KEY, "active");
    localStorage.setItem(ACTIVATION_HARDWARE, hardwareName);
    localStorage.setItem(ACTIVATION_IP, ipAddress);
    localStorage.setItem(ACTIVATION_EXPIRY, expiresAt.toString());
    localStorage.setItem(ACTIVATION_KEY_STRING, keyString);

    // 记录同步时间
    localStorage.setItem(LAST_SYNC_TIME, Date.now().toString());

    // 启动同步机制
    startActivationSync();
  } catch (error) {
    console.error("设置激活状态失败:", error);
  }
}

/**
 * 清除用户激活状态
 */
export function clearActivation(): void {
  try {
    console.log("清除激活status");

    localStorage.removeItem(ACTIVATION_KEY);
    localStorage.removeItem(ACTIVATION_HARDWARE);
    localStorage.removeItem(ACTIVATION_IP);
    localStorage.removeItem(ACTIVATION_EXPIRY);
    localStorage.removeItem(ACTIVATION_KEY_STRING);
    localStorage.removeItem(LAST_SYNC_TIME);

    // 停止同步
    stopActivationSync();
  } catch (error) {
    console.error("清除激活状态失败:", error);
  }
}

/**
 * 与服务器同步激活状态
 * 实现了会话管理以防止异步竞态条件
 * @returns {Promise<boolean>} 同步是否成功
 */
export async function syncActivationWithServer(): Promise<boolean> {
  // 防止并发同步请求
  if (isSyncInProgress) {
    console.log("同步正在进行中，跳过本次请求");
    return false;
  }

  // 创建新的会话对象以防止竞态条件
  const session: SyncSession = {
    id: Math.random().toString(36).substring(2, 15),
    timestamp: Date.now()
  };
  currentSyncSession = session;
  isSyncInProgress = true;

  try {
    // 获取密钥字符串
    const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
    if (!keyString) {
      return false;
    }

    // 调用API获取密钥当前状态
    const response = await getKeyByString(keyString);
    console.log(" syncActivationWithServer was called", keyString);
    // 检查会话是否仍然有效（防止竞态条件）
    if (currentSyncSession !== session) {
      console.log("同步会话已过期，忽略响应");
      return false;
    }

    const key: KeyApiResponse = response;

    // 再次检查会话有效性（在JSON解析后）
    if (currentSyncSession !== session) {
      console.log("同步会话已过期，忽略响应");
      return false;
    }

    if (!key || !key.status) {
      // 密钥不存在或响应格式无效，清除本地激活
      console.warn("密钥不存在或响应格式无效，清除本地激活");
      clearActivation();
      return false;
    }

    // 处理所有可能的服务器状态
    if (key.status === "expired" || key.status === "revoked") {
      console.warn("密钥失效或者被撤销，清除本地激活");
      clearActivation();
      return false;
    }

    if (key.status === "paused") {
      // 服务器上密钥被暂停，更新本地状态
      console.log("服务器密钥状态为暂停，更新本地状态");
      localStorage.setItem(ACTIVATION_KEY, "paused");
      // 暂停状态下不需要更新过期时间
      localStorage.setItem(LAST_SYNC_TIME, Date.now().toString());
      return true;
    }

    if (key.status === "active") {
      // 密钥激活中，更新过期时间
      if (!key.expires_at || Date.now() - key.expires_at > 0) {
        console.warn("密钥已过期，清除本地激活");
        clearActivation();
        return false;
      }

      localStorage.setItem(ACTIVATION_KEY, "active");
      localStorage.setItem(ACTIVATION_EXPIRY, key.expires_at.toString());
      localStorage.setItem(LAST_SYNC_TIME, Date.now().toString());
      console.log("同步激活状态成功，更新过期时间");
      return true;
    }

    // 其他未知状态，清除本地激活
    console.warn(`未知的密钥状态: ${key.status}，清除本地激活`);
    clearActivation();
    return false;

  } catch (error) {
    // 检查会话有效性（在异常处理中）
    if (currentSyncSession !== session) {
      console.log("同步会话已过期，忽略错误");
      return false;
    }

    console.error("同步激活状态失败:", error);
    // 异常情况下不清除激活状态，等待下次同步
    return false;
  } finally {
    // 只有当前会话才清理标志
    if (currentSyncSession === session) {
      isSyncInProgress = false;
    }
  }
}

/**
 * 启动定期同步激活状态
 * 修复了定时器重叠问题
 */
export function startActivationSync(): void {
  // 防止重复启动 - 确保清理所有定时器
  stopActivationSync();

  console.log(`激活状态已设置，将在${FIRST_SYNC_DELAY / 1000}秒后开始同步`);

  // 保存首次同步的定时器ID，确保可以被正确取消
  firstSyncTimeoutId = setTimeout(() => {
    // 清除首次同步定时器ID
    firstSyncTimeoutId = null;
    
    console.log("开始首次同步激活状态");
    syncActivationWithServer().catch((error) => {
      console.error("首次同步激活状态失败:", error);
    });

    // 设置定期同步
    syncIntervalId = setInterval(() => {
      console.log("执行定期同步激活状态");
      syncActivationWithServer().catch((error) => {
        console.error("定期同步激活状态失败:", error);
      });
    }, SYNC_INTERVAL);
  }, FIRST_SYNC_DELAY);
}

/**
 * 停止定期同步
 * 修复了定时器清理问题，确保所有定时器都被正确取消
 */
export function stopActivationSync(): void {
  // 清理定期同步定时器
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  
  // 清理首次同步定时器
  if (firstSyncTimeoutId) {
    clearTimeout(firstSyncTimeoutId);
    firstSyncTimeoutId = null;
  }
  
  // 取消当前的同步会话
  currentSyncSession = null;
}

// 在模块加载时自动启动同步（仅在浏览器环境）
// 使用Symbol确保唯一性，防止模块重复初始化
const INIT_SYMBOL = Symbol('activation-init');
declare global {
  interface Window {
    [INIT_SYMBOL]?: boolean;
  }
}

if (typeof window !== "undefined" && !window[INIT_SYMBOL]) {
  window[INIT_SYMBOL] = true;
  
  // 使用setTimeout移到下一个事件循环，避免模块加载时的递归问题
  setTimeout(() => {
    // 直接检查localStorage状态，而不是调用isActivated
    const status = localStorage.getItem(ACTIVATION_KEY);
    if (status === "active") {
      console.log("初始化：检测到激活状态，启动同步");
      startActivationSync();
    }
  }, INIT_DELAY); // 增加延迟，确保其他模块初始化完成
}

