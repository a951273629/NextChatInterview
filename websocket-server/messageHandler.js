import { formatLog, validateMessage } from './utils.js';

/**
 * 消息处理器类
 * 负责处理和路由WebSocket消息
 */
export class MessageHandler {
  constructor(roomManager) {
    this.roomManager = roomManager;
  }

  /**
   * 处理客户端消息
   * @param {Object} client - 客户端对象
   * @param {string} messageStr - 消息字符串
   */
  handleMessage(client, messageStr) {
    // 验证消息格式
    const validation = validateMessage(messageStr);
    if (!validation.isValid) {
      console.error(formatLog('error', '消息格式验证失败', {
        clientId: client.id,
        error: validation.error,
        message: messageStr.substring(0, 100) // 只记录前100字符
      }));
      
      this.sendErrorMessage(client, '消息格式错误');
      return;
    }

    const { message } = validation;
    
    console.log(formatLog('info', '收到客户端消息', {
      clientId: client.id,
      type: message.type,
      mode: client.mode
    }));

    // 根据消息类型分发处理
    switch (message.type) {
      case 'speech_recognition':
        this.handleSpeechRecognition(client, message);
        break;
      
      case 'ping':
        this.handlePing(client, message);
        break;
      
      case 'pong':
        this.handlePong(client, message);
        break;
      
      default:
        console.warn(formatLog('warn', '未知消息类型', {
          clientId: client.id,
          type: message.type
        }));
    }
  }

  /**
   * 处理语音识别消息
   * @param {Object} client - 客户端对象  
   * @param {Object} message - 语音识别消息
   */
  handleSpeechRecognition(client, message) {
    // 只有发送端可以发送语音识别消息
    if (client.mode !== 'sender') {
      console.warn(formatLog('warn', '非发送端尝试发送语音识别消息', {
        clientId: client.id,
        mode: client.mode
      }));
      
      this.sendErrorMessage(client, '只有发送端可以发送语音识别消息');
      return;
    }

    const { activationKey } = client;
    const { data } = message;

    // 验证语音识别数据
    if (!this.validateSpeechData(data)) {
      this.sendErrorMessage(client, '语音识别数据格式错误');
      return;
    }

    console.log(formatLog('info', '处理语音识别消息', {
      clientId: client.id,
      activationKey,
      text: data.text.substring(0, 50), // 只记录前50字符
      isFinal: data.isFinal,
      language: data.language
    }));

    // 转发消息给同房间的所有接收端
    this.forwardToReceivers(activationKey, message, client.id);
  }

  /**
   * 处理心跳ping消息
   * @param {Object} client - 客户端对象
   * @param {Object} message - ping消息
   */
  handlePing(client, message) {
    // 响应pong消息
    const pongMessage = {
      type: 'pong',
      timestamp: Date.now(),
      data: message.data
    };

    this.sendMessage(client, pongMessage);
  }

  /**
   * 处理心跳pong消息
   * @param {Object} client - 客户端对象
   * @param {Object} message - pong消息
   */
  handlePong(client, message) {
    // 更新客户端活跃状态
    client.isAlive = true;
    
    console.log(formatLog('debug', '收到心跳响应', {
      clientId: client.id
    }));
  }

  /**
   * 转发消息给接收端
   * @param {string} activationKey - 激活密钥
   * @param {Object} message - 原始消息
   * @param {string} senderClientId - 发送者客户端ID
   */
  forwardToReceivers(activationKey, message, senderClientId) {
    const receivers = this.roomManager.getReceivers(activationKey);
    
    if (receivers.length === 0) {
      console.warn(formatLog('warn', '房间内没有接收端', {
        activationKey,
        senderClientId
      }));
      return;
    }

    // 创建转发消息（添加转发标识）
    const forwardMessage = {
      ...message,
      forwarded: true,
      originalSender: senderClientId,
      forwardedAt: Date.now()
    };

    const messageStr = JSON.stringify(forwardMessage);
    let successCount = 0;
    let failCount = 0;

    // 发送给所有接收端
    receivers.forEach(receiver => {
      try {
        if (receiver.ws.readyState === 1) { // WebSocket.OPEN
          receiver.ws.send(messageStr);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(formatLog('error', '转发消息失败', {
          receiverClientId: receiver.id,
          senderClientId,
          error: error.message
        }));
        failCount++;
      }
    });

    console.log(formatLog('info', '消息转发完成', {
      activationKey,
      senderClientId,
      receiversTotal: receivers.length,
      successCount,
      failCount,
      messageType: message.type
    }));
  }

  /**
   * 验证语音识别数据
   * @param {Object} data - 语音识别数据
   * @returns {boolean} 是否有效
   */
  validateSpeechData(data) {
    if (!data) return false;
    
    // 检查必需字段
    if (!data.text || typeof data.text !== 'string') {
      return false;
    }
    
    if (typeof data.isFinal !== 'boolean') {
      return false;
    }
    
    if (!data.language || typeof data.language !== 'string') {
      return false;
    }
    
    if (!data.sessionId || typeof data.sessionId !== 'string') {
      return false;
    }

    // 检查文本长度限制
    if (data.text.length > 1000) {
      console.warn(formatLog('warn', '语音识别文本过长', {
        textLength: data.text.length
      }));
      return false;
    }

    return true;
  }

  /**
   * 发送消息给客户端
   * @param {Object} client - 客户端对象
   * @param {Object} message - 消息对象
   */
  sendMessage(client, message) {
    try {
      if (client.ws.readyState === 1) { // WebSocket.OPEN
        const messageStr = JSON.stringify(message);
        client.ws.send(messageStr);
        
        console.log(formatLog('debug', '发送消息给客户端', {
          clientId: client.id,
          messageType: message.type
        }));
      } else {
        console.warn(formatLog('warn', '客户端连接不可用', {
          clientId: client.id,
          readyState: client.ws.readyState
        }));
      }
    } catch (error) {
      console.error(formatLog('error', '发送消息失败', {
        clientId: client.id,
        error: error.message
      }));
    }
  }

  /**
   * 发送错误消息给客户端
   * @param {Object} client - 客户端对象
   * @param {string} errorMessage - 错误消息
   */
  sendErrorMessage(client, errorMessage) {
    const message = {
      type: 'error',
      timestamp: Date.now(),
      data: {
        error: errorMessage
      }
    };

    this.sendMessage(client, message);
  }

  /**
   * 发送房间状态给客户端
   * @param {Object} client - 客户端对象
   */
  sendRoomStatus(client) {
    const stats = this.roomManager.getRoomStats(client.activationKey);
    
    const message = {
      type: 'room_status',
      timestamp: Date.now(),
      data: {
        roomStats: stats,
        clientInfo: {
          id: client.id,
          mode: client.mode,
          sessionId: client.sessionId,
          joinTime: client.joinTime
        }
      }
    };

    this.sendMessage(client, message);
  }

  /**
   * 广播房间状态更新
   * @param {string} activationKey - 激活密钥
   */
  broadcastRoomStatusUpdate(activationKey) {
    const stats = this.roomManager.getRoomStats(activationKey);
    
    const message = {
      type: 'room_status_update',
      timestamp: Date.now(),
      data: {
        roomStats: stats
      }
    };

    const messageStr = JSON.stringify(message);
    
    // 发送给房间内所有客户端
    const room = this.roomManager.rooms.get(activationKey);
    if (room) {
      room.forEach(client => {
        try {
          if (client.ws.readyState === 1) {
            client.ws.send(messageStr);
          }
        } catch (error) {
          console.error(formatLog('error', '广播房间状态失败', {
            clientId: client.id,
            error: error.message
          }));
        }
      });
    }
  }
} 