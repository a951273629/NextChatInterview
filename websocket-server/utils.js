import { URL } from 'url';

/**
 * 解析WebSocket连接的查询参数
 * @param {string} url - WebSocket连接URL
 * @returns {Object} 解析后的参数对象
 */
export function parseConnectionParams(url) {
  try {
    const urlObj = new URL(url, 'ws://localhost');
    const params = Object.fromEntries(urlObj.searchParams);
    
    return {
      activationKey: params.key || '',
      mode: params.mode || 'receiver',
      sessionId: params.sessionId || '',
      isValid: !!(params.key && params.mode && params.sessionId)
    };
  } catch (error) {
    console.error('❌ URL解析失败:', error);
    return {
      activationKey: '',
      mode: 'receiver',
      sessionId: '',
      isValid: false
    };
  }
}

/**
 * 验证激活密钥
 * @param {string} key - 激活密钥
 * @returns {boolean} 是否有效
 */
export function validateActivationKey(key) {
  // 这里可以添加更复杂的验证逻辑
  return typeof key === 'string' && key.length > 0;
}

/**
 * 验证同步模式
 * @param {string} mode - 同步模式
 * @returns {boolean} 是否有效
 */
export function validateSyncMode(mode) {
  return mode === 'sender' || mode === 'receiver';
}

/**
 * 生成客户端唯一标识
 * @param {string} sessionId - 会话ID
 * @param {string} mode - 同步模式
 * @returns {string} 客户端标识
 */
export function generateClientId(sessionId, mode) {
  return `${mode}_${sessionId}_${Date.now()}`;
}

/**
 * 格式化日志消息
 * @param {string} level - 日志级别
 * @param {string} message - 消息内容
 * @param {Object} data - 附加数据
 * @returns {string} 格式化的日志消息
 */
export function formatLog(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data) : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message} ${dataStr}`.trim();
}

/**
 * 验证WebSocket消息格式
 * @param {string} messageStr - 消息字符串
 * @returns {Object} 验证结果
 */
export function validateMessage(messageStr) {
  try {
    const message = JSON.parse(messageStr);
    
    if (!message.type || !message.timestamp) {
      return { isValid: false, error: '消息缺少必需字段' };
    }
    
    if (message.type === 'speech_recognition') {
      if (!message.data || !message.data.text || !message.data.sessionId) {
        return { isValid: false, error: '语音识别消息格式不正确' };
      }
    }
    
    return { isValid: true, message };
  } catch (error) {
    return { isValid: false, error: 'JSON解析失败' };
  }
} 