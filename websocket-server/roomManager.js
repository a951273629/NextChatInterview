import { formatLog, generateClientId } from './utils.js';

/**
 * 房间管理器类
 * 负责管理不同激活密钥的房间和客户端连接
 */
export class RoomManager {
  constructor() {
    // 房间映射: key -> Set<客户端对象>
    this.rooms = new Map();
    // 客户端映射: clientId -> 客户端对象
    this.clients = new Map();
  }

  /**
   * 客户端加入房间
   * @param {WebSocket} ws - WebSocket连接
   * @param {Object} params - 连接参数
   * @returns {Object} 客户端对象
   */
  addClient(ws, params) {
    const { activationKey, mode, sessionId } = params;
    const clientId = generateClientId(sessionId, mode);
    
    const client = {
      id: clientId,
      ws,
      activationKey,
      mode,
      sessionId,
      joinTime: Date.now(),
      isAlive: true
    };

    // 添加到客户端映射
    this.clients.set(clientId, client);

    // 添加到对应房间
    if (!this.rooms.has(activationKey)) {
      this.rooms.set(activationKey, new Set());
    }
    this.rooms.get(activationKey).add(client);

    console.log(formatLog('info', '客户端加入房间', {
      clientId,
      activationKey,
      mode,
      sessionId,
      roomSize: this.rooms.get(activationKey).size
    }));

    return client;
  }

  /**
   * 客户端离开房间
   * @param {string} clientId - 客户端ID
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const { activationKey } = client;

    // 从客户端映射中移除
    this.clients.delete(clientId);

    // 从房间中移除
    const room = this.rooms.get(activationKey);
    if (room) {
      room.delete(client);
      
      // 如果房间为空，删除房间
      if (room.size === 0) {
        this.rooms.delete(activationKey);
      }
    }

    console.log(formatLog('info', '客户端离开房间', {
      clientId,
      activationKey,
      mode: client.mode,
      remainingInRoom: room ? room.size : 0
    }));
  }

  /**
   * 获取房间内的所有接收端客户端
   * @param {string} activationKey - 激活密钥
   * @returns {Array} 接收端客户端数组
   */
  getReceivers(activationKey) {
    const room = this.rooms.get(activationKey);
    if (!room) return [];

    return Array.from(room)
      .filter(client => client.mode === 'receiver' && client.ws.readyState === 1);
  }

  /**
   * 获取房间内的所有发送端客户端
   * @param {string} activationKey - 激活密钥
   * @returns {Array} 发送端客户端数组
   */
  getSenders(activationKey) {
    const room = this.rooms.get(activationKey);
    if (!room) return [];

    return Array.from(room)
      .filter(client => client.mode === 'sender' && client.ws.readyState === 1);
  }

  /**
   * 获取房间统计信息
   * @param {string} activationKey - 激活密钥
   * @returns {Object} 房间统计
   */
  getRoomStats(activationKey) {
    const room = this.rooms.get(activationKey);
    if (!room) {
      return { total: 0, senders: 0, receivers: 0, exists: false };
    }

    const clients = Array.from(room);
    const senders = clients.filter(c => c.mode === 'sender').length;
    const receivers = clients.filter(c => c.mode === 'receiver').length;

    return {
      total: clients.length,
      senders,
      receivers,
      exists: true
    };
  }

  /**
   * 广播消息到房间内的所有接收端
   * @param {string} activationKey - 激活密钥
   * @param {string} message - 消息内容
   * @param {string} excludeClientId - 排除的客户端ID
   */
  broadcastToReceivers(activationKey, message, excludeClientId = null) {
    const receivers = this.getReceivers(activationKey);
    let successCount = 0;
    let failCount = 0;

    receivers.forEach(client => {
      if (client.id === excludeClientId) return;

      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(message);
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(formatLog('error', '发送消息失败', {
          clientId: client.id,
          error: error.message
        }));
        failCount++;
      }
    });

    console.log(formatLog('info', '广播消息到接收端', {
      activationKey,
      receiversCount: receivers.length,
      successCount,
      failCount
    }));
  }

  /**
   * 清理断开的连接
   */
  cleanupDisconnectedClients() {
    const disconnectedClients = [];

    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState !== 1) { // Not WebSocket.OPEN
        disconnectedClients.push(clientId);
      }
    });

    disconnectedClients.forEach(clientId => {
      this.removeClient(clientId);
    });

    if (disconnectedClients.length > 0) {
      console.log(formatLog('info', '清理断开的连接', {
        cleanedCount: disconnectedClients.length
      }));
    }
  }

  /**
   * 获取全局统计信息
   * @returns {Object} 全局统计
   */
  getGlobalStats() {
    const totalClients = this.clients.size;
    const totalRooms = this.rooms.size;
    
    let totalSenders = 0;
    let totalReceivers = 0;

    this.clients.forEach(client => {
      if (client.mode === 'sender') totalSenders++;
      else if (client.mode === 'receiver') totalReceivers++;
    });

    return {
      totalClients,
      totalRooms,
      totalSenders,
      totalReceivers
    };
  }

  /**
   * 心跳检测
   */
  heartbeat() {
    this.clients.forEach(client => {
      if (client.ws.readyState === 1) {
        try {
          client.ws.ping();
          client.isAlive = true;
        } catch (error) {
          client.isAlive = false;
        }
      } else {
        client.isAlive = false;
      }
    });

    // 清理不活跃的连接
    const deadClients = [];
    this.clients.forEach((client, clientId) => {
      if (!client.isAlive) {
        deadClients.push(clientId);
      }
    });

    deadClients.forEach(clientId => {
      this.removeClient(clientId);
    });
  }
} 