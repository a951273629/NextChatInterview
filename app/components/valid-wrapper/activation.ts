import { safeLocalStorage } from "../../utils";

const ACTIVATION_KEY = "user_activation_status";
const ACTIVATION_HARDWARE = "user_activation_hardware";
const ACTIVATION_IP = "user_activation_ip";
const ACTIVATION_EXPIRY = "user_activation_expiry";
const ACTIVATION_KEY_STRING = "user_activation_key_string";
const LAST_SYNC_TIME = "user_activation_last_sync";
const SYNC_INTERVAL = 5 * 60 * 1000; // 5分钟，单位：毫秒

const localStorage = safeLocalStorage();
let syncIntervalId: NodeJS.Timeout | null = null;

/**
 * 检查用户是否已激活
 * @returns 用户是否已激活
 */
export function isActivated(): boolean {
  try {
    // 从localStorage获取激活状态
    const status = localStorage.getItem(ACTIVATION_KEY);
    if (!status) return false;

    // 检查过期时间
    const expiryTime = localStorage.getItem(ACTIVATION_EXPIRY);
    if (expiryTime) {
      const expiryTimestamp = parseInt(expiryTime);
      if (Date.now() > expiryTimestamp) {
        // 如果已过期，清除激活状态
        clearActivation();
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
 * 获取剩余激活时间（毫秒）- 安全版本
 * 定期与服务器同步以防止本地篡改
 * @returns 剩余时间（毫秒），如果未激活则返回0
 */
export function getRemainingTime(): number {
  try {
    // 首先检查是否已激活
    if (!isActivated()) return 0;

    // 获取过期时间
    const expiryTime = localStorage.getItem(ACTIVATION_EXPIRY);
    if (!expiryTime) return 0;

    const expiryTimestamp = parseInt(expiryTime);
    const remainingTime = expiryTimestamp - Date.now();

    // 检查上次同步时间，如果从未同步或超过同步间隔的两倍时间未同步，立即触发同步
    const lastSyncTime = localStorage.getItem(LAST_SYNC_TIME);
    if (
      !lastSyncTime ||
      Date.now() - parseInt(lastSyncTime) > SYNC_INTERVAL * 2
    ) {
      // 异步触发同步，不阻塞当前函数返回
      syncActivationWithServer().catch(console.error);
    }

    // 如果已同步但剩余时间小于等于0，说明已过期
    if (remainingTime <= 0) {
      clearActivation();
      return 0;
    }

    // 确保应用启动后开始同步
    if (typeof window !== "undefined" && !syncIntervalId) {
      startActivationSync();
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
 * 获取设备信息
 * @returns {Promise<{ipAddress: string, hardwareName: string}>} IP地址和硬件信息
 */
export async function getDeviceInfo(): Promise<{
  ipAddress: string;
  hardwareName: string;
}> {
  try {
    // 获取IP地址 (使用公共API)
    const ipResponse = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipResponse.json();
    const ipAddress = ipData.ip;

    // 获取设备信息
    const hardwareName = navigator.userAgent;

    return {
      ipAddress,
      hardwareName: hardwareName.substring(0, 100), // 限制长度
    };
  } catch (error) {
    console.error("获取设备信息失败:", error);
    // 如果获取失败，返回默认值
    return {
      ipAddress: "未知IP",
      hardwareName: navigator.userAgent.substring(0, 100) || "未知设备",
    };
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
    if (!keyString) return false;

    // 调用API获取密钥当前状态
    const response = await fetch(`/api/key-generate?key=${keyString}`);
    if (!response.ok) return false;

    const key = await response.json();
    if (!key) {
      // 密钥不存在，清除本地激活
      clearActivation();
      return false;
    }

    // 检查密钥状态
    if (key.status !== 1) {
      // KeyStatus.ACTIVE = 1
      // 密钥不是激活状态，清除本地激活
      clearActivation();
      return false;
    }

    // 更新过期时间
    if (key.expires_at) {
      localStorage.setItem(ACTIVATION_EXPIRY, key.expires_at.toString());
      // 更新最后同步时间
      localStorage.setItem(LAST_SYNC_TIME, Date.now().toString());
      return true;
    }

    return false;
  } catch (error) {
    console.error("同步激活状态失败:", error);
    return false;
  }
}

/**
 * 启动定期同步激活状态
 */
export function startActivationSync(): void {
  // 防止重复启动
  stopActivationSync();

  // 立即进行一次同步
  syncActivationWithServer().catch(console.error);

  // 设置定期同步
  syncIntervalId = setInterval(() => {
    syncActivationWithServer().catch(console.error);
  }, SYNC_INTERVAL);
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
if (typeof window !== "undefined") {
  // 只有在已激活状态下才启动同步
  if (isActivated()) {
    startActivationSync();
  }
}
