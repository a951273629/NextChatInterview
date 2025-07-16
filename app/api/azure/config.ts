/**
 * Azure 服务配置模块
 * 统一管理 Azure 相关的环境变量读取
 */

import { getServerSideConfig } from "@/app/config/server";

export interface AzureSpeechEnvironmentConfig {
  key: string[];
  region: string[];
}

// 缓存对象，存储可用的 key-region 对
interface KeyRegionCache {
  keys: string[];
  regions: string[];
  lastUpdated: number;
}

let keyRegionCache: KeyRegionCache | null = null;

/**
 * 从环境变量获取 Azure Speech 配置
 * @returns Azure Speech 配置对象
 * @throws Error 当配置缺失时抛出错误
 */
export function getAzureSpeechEnvironmentConfig(): AzureSpeechEnvironmentConfig {
  // 检查缓存是否有效
  const now = Date.now();
  if (keyRegionCache && (now - keyRegionCache.lastUpdated) ) {
    console.log("🔄 使用缓存的 Azure Speech 配置");
    return {
      key: [...keyRegionCache.keys],
      region: [...keyRegionCache.regions],
    };
  }

  // 从服务端配置读取配置
  const serverConfig = getServerSideConfig();
  const keyEnv = serverConfig.azureSpeechKey;
  const regionEnv = serverConfig.azureSpeechRegion;
  
  const key = keyEnv ? keyEnv.split(',').map(k => k.trim()).filter(k => k.length > 0) : [];
  const region = regionEnv ? regionEnv.split(',').map(r => r.trim()).filter(r => r.length > 0) : [];

  console.log("🔧 读取 Azure Speech 环境配置:", {
    hasKey: key.length > 0,
    keyCount: key.length,
    keyPrefix: key.length > 0 ? `${key[0].substring(0, 8)}...` : "未设置",
    regionCount: region.length,
    regions: region.length > 0 ? region : "未设置",
  });

  if (key.length === 0 || region.length === 0) {
    const errorMsg =
      "Azure Speech 配置缺失。请设置 AZURE_SPEECH_KEY 和 AZURE_SPEECH_REGION 环境变量。";
    console.error("❌", errorMsg);
    throw new Error(errorMsg);
  }

  // 更新缓存
  keyRegionCache = {
    keys: [...key],
    regions: [...region],
    lastUpdated: now,
  };

  return {
    key,
    region,
  };
}

/**
 * 从缓存中移除指定的 key-region 对
 * @param targetKey 要移除的密钥
 * @param targetRegion 要移除的区域
 * @returns 是否成功移除
 */
export function removeKeyRegionPair(targetKey: string, targetRegion: string): boolean {
  if (!keyRegionCache) {
    console.warn("⚠️ 缓存未初始化，无法移除 key-region 对");
    return false;
  }

  const keyIndex = keyRegionCache.keys.indexOf(targetKey);
  // const regionIndex = keyRegionCache.regions.indexOf(targetRegion);

  if (keyIndex === -1) {
    console.warn("⚠️ 未找到指定的 key-region 对:", { targetKey: `${targetKey.substring(0, 8)}...`, targetRegion });
    return false;
  }

  // 移除指定的 key-region 对
  keyRegionCache.keys.splice(keyIndex, 1);
  keyRegionCache.regions.splice(keyIndex, 1);

  console.log("✅ 已从缓存中移除 key-region 对:", { 
    targetKey: `${targetKey.substring(0, 8)}...`, 
    targetRegion,
    remainingKeys: keyRegionCache.keys.length,
    remainingRegions: keyRegionCache.regions.length,
  });

  return true;
}

/**
 * 强制刷新缓存
 */
export function refreshKeyRegionCache(): void {
  keyRegionCache = null;
  console.log("🔄 已清空 Azure Speech 配置缓存");
}

/**
 * 检查 Azure Speech 环境配置是否可用
 * @returns 配置是否完整
 */
export function isAzureSpeechEnvironmentConfigAvailable(): boolean {
  try {
    getAzureSpeechEnvironmentConfig();
    return true;
  } catch (error) {
    console.error("❌ Azure Speech 环境配置不可用:", error);
    return false;
  }
}

/**
 * 获取 Azure Speech 服务的基础 URL
 * @param region 区域名称
 * @returns 服务基础 URL
 */
export function getAzureSpeechServiceUrl(region: string): string {
  return `https://${region}.api.cognitive.microsoft.com`;
}

/**
 * 验证 Azure 区域名称格式
 * @param region 区域名称
 * @returns 是否为有效格式
 */
export function isValidAzureRegion(region: string): boolean {
  // Azure 区域格式通常为: eastus, westus2, southeastasia 等
  const regionPattern = /^[a-z]+[a-z0-9]*$/;
  return regionPattern.test(region);
}

/**
 * 获取 Azure Speech 订阅信息（用于 API 调用）
 * @param index 可选的索引，指定使用哪个 key 和 region，默认为 0
 * @returns 订阅信息对象
 */
export function getAzureSpeechSubscriptionInfo(index: number = 0) {
  const config = getAzureSpeechEnvironmentConfig();
  
  const selectedKey = config.key[index] || config.key[0] || "";
  const selectedRegion = config.region[index] || config.region[0] || "";
  
  if (!isValidAzureRegion(selectedRegion)) {
    console.warn("⚠️ Azure 区域格式可能不正确:", selectedRegion);
  }

  return {
    subscriptionKey: selectedKey,
    region: selectedRegion,
    serviceUrl: getAzureSpeechServiceUrl(selectedRegion),
    availableKeys: config.key.length,
    availableRegions: config.region.length,
  };
}