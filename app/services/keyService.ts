/**
 * 密钥操作服务
 * 提供密钥相关的所有 API 调用封装
 */

/**
 * 获取所有密钥
 * @returns Promise<any[]> 返回所有密钥数组
 * @throws Error 当API调用失败时抛出错误
 */
export async function getAllKeys(): Promise<any[]> {
  const response = await fetch("/api/key-generate");
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "获取密钥失败");
  }

  return await response.json();
}

/**
 * 创建新密钥
 * @param expiresHours 过期时间(小时)
 * @param notes 备注信息(可选)
 * @returns Promise<any> 返回创建的密钥对象
 * @throws Error 当API调用失败时抛出错误
 */
export async function createKey(expiresHours: number, notes?: string): Promise<any> {
  const response = await fetch("/api/key-generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expiresHours,
      notes: notes?.trim() || null,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "创建密钥失败");
  }

  return await response.json();
}

/**
 * 删除密钥
 * @param keyString 密钥字符串
 * @returns Promise<any> 返回删除结果
 * @throws Error 当API调用失败时抛出错误
 */
export async function deleteKey(keyString: string): Promise<any> {
  const response = await fetch(`/api/key-generate?key=${keyString}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "删除密钥失败");
  }

  return await response.json();
}

/**
 * 根据密钥字符串查询密钥信息
 * @param keyString 密钥字符串
 * @returns Promise<any> 返回密钥对象或null
 * @throws Error 当API调用失败时抛出错误
 */
export async function getKeyByString(keyString: string): Promise<any> {
  console.log(" getKeyByString was called", keyString);
  
  const response = await fetch(`/api/key-generate?key=${keyString}`);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "查询密钥失败");
  }

  return await response.json();
}

/**
 * 激活密钥
 * @param keyString 密钥字符串
 * @param ipAddress IP地址
 * @param hardwareName 硬件名称
 * @returns Promise<any> 返回更新后的密钥对象
 * @throws Error 当API调用失败时抛出错误
 */
export async function activateKey(
  keyString: string, 
  ipAddress: string, 
  hardwareName: string
): Promise<any> {
  const response = await fetch("/api/key-generate", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      keyString, 
      ipAddress, 
      hardwareName 
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "激活密钥失败");
  }

  return await response.json();
}

/**
 * 撤销密钥
 * @param keyString 密钥字符串
 * @returns Promise<any> 返回更新后的密钥对象
 * @throws Error 当API调用失败时抛出错误
 */
export async function revokeKey(keyString: string): Promise<any> {
  const response = await fetch("/api/key-generate", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keyString,
      action: "revoke",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "撤销密钥失败");
  }

  return await response.json();
}

/**
 * 暂停密钥
 * @param keyString 密钥字符串
 * @returns Promise<any> 返回更新后的密钥对象
 * @throws Error 当API调用失败时抛出错误
 */
export async function pauseKey(keyString: string): Promise<any> {
  const response = await fetch("/api/key-generate", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keyString,
      action: "pause",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "暂停密钥失败");
  }

  return await response.json();
}

/**
 * 恢复密钥
 * @param keyString 密钥字符串
 * @returns Promise<any> 返回更新后的密钥对象
 * @throws Error 当API调用失败时抛出错误
 */
export async function resumeKey(keyString: string): Promise<any> {
  const response = await fetch("/api/key-generate", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keyString,
      action: "resume",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "恢复密钥失败");
  }

  return await response.json();
}

/**
 * 获取设备信息
 * @returns Promise<{ipAddress: string, hardwareName: string}> 返回IP地址和硬件信息
 * @throws Error 当获取失败时抛出错误
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