import { safeLocalStorage } from "../../utils";

// 导出以便其他组件使用
export { safeLocalStorage };

export const ACTIVATION_KEY = "user_activation_status";
export const ACTIVATION_HARDWARE = "user_activation_hardware";
export const ACTIVATION_IP = "user_activation_ip";
export const ACTIVATION_EXPIRY = "user_activation_expiry";
export const ACTIVATION_KEY_STRING = "user_activation_key_string";
export const LAST_SYNC_TIME = "user_activation_last_sync";
export const SYNC_INTERVAL =  60 * 1000; // 1分钟，单位：毫秒

const localStorage = safeLocalStorage();
let syncIntervalId: NodeJS.Timeout | null = null;

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
      const expiryTimestamp = parseInt(expiryTime);
      // 添加5秒的缓冲时间，避免时间精度问题导致刚激活就被判定为过期
      if (Date.now() > expiryTimestamp + 5000) {
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

    const expiryTimestamp = parseInt(expiryTime);
    const remainingTime = expiryTimestamp - Date.now();

    // 添加5秒缓冲时间，避免时间精度问题导致刚激活就被判定为过期
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
 * 格式化剩余时间为易读形式
 * @param remainingMs 剩余毫秒数
 * @returns 格式化后的时间字符串（例如：10天8小时）
 */
export function formatRemainingTime(remainingMs: number): string {
  if (remainingMs <= 0) return "已过期";

  const seconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}天${remainingHours > 0 ? remainingHours + "小时" : ""}`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}小时${
      remainingMinutes > 0 ? remainingMinutes + "分钟" : ""
    }`;
  } else if (minutes > 0) {
    return `${minutes}分钟`;
  } else {
    return `${seconds}秒`;
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
 * @returns {Promise<boolean>} 同步是否成功
 */
export async function syncActivationWithServer(): Promise<boolean> {
  try {

    // 获取密钥字符串
    const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
    if (!keyString) {
      return false;
    }

    // 调用API获取密钥当前状态
    const response = await fetch(`/api/key-generate?key=${keyString}`);

    // 处理网络错误或服务器错误
    if (!response.ok) {
      console.warn("同步激活状态时遇到网络错误，稍后重试");
      // 不清除激活状态，等待下次同步

      return false;
    }

    const key = await response.json();
    if (!key) {
      // 密钥不存在，清除本地激活
      console.warn("密钥不存在，清除本地激活");
      // 直接清除激活状态，不通过isActivated函数
      clearActivation();

      return false;
    }
    if (key.status === "expired" || key.status === "revoked") {
      // 判断秘钥是不是过期
      console.warn("密钥失效或者被撤销，清除本地激活");
      clearActivation();

      return false;
    }
    if (!key.expires_at || Date.now() - key.expires_at > 0) {
      // 过期时间小于当前时间，清除本地激活
      console.warn("密钥已过期，清除本地激活");
      clearActivation();

      return false;
    }

    localStorage.setItem(ACTIVATION_EXPIRY, key.expires_at.toString());
    // 更新最后同步时间
    localStorage.setItem(LAST_SYNC_TIME, Date.now().toString());
    console.log("同步激活状态成功，更新过期时间");

    return true;
  } catch (error) {
    console.error("同步激活状态失败:", error);
    // 异常情况下不清除激活状态，等待下次同步

    return false;
  }
}

/**
 * 启动定期同步激活状态
 */
export function startActivationSync(): void {
  // 防止重复启动
  stopActivationSync();

  // 使用延迟而非立即同步，避免频繁请求导致激活失败
  const firstSyncDelay = 5 * 1000; 

  console.log(`激活状态已设置，将在${firstSyncDelay / 1000}秒后开始同步`);

  setTimeout(() => {
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
  }, firstSyncDelay);
}

/**
 * 停止定期同步
 */
export function stopActivationSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

// 在模块加载时自动启动同步（仅在浏览器环境）
let hasInitialized = false;
if (typeof window !== "undefined" && !hasInitialized) {
  hasInitialized = true;
  // 使用setTimeout移到下一个事件循环，避免模块加载时的递归问题
  setTimeout(() => {
    // 直接检查localStorage状态，而不是调用isActivated
    const status = localStorage.getItem(ACTIVATION_KEY);
    if (status === "active") {
      console.log("初始化：检测到激活状态，启动同步");
      startActivationSync();
    }
  }, 0);
}
