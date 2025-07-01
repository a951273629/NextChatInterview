import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { RoomManager } from './roomManager.js';
import { MessageHandler } from './messageHandler.js';
import { 
  parseConnectionParams, 
  validateActivationKey, 
  validateSyncMode,
  formatLog 
} from './utils.js';

// 配置常量
const SERVER_PORT = process.env.WS_PORT || 8080;
const SERVER_HOST = process.env.WS_HOST || 'localhost';
const HEARTBEAT_INTERVAL = 60000; // 60秒心跳间隔
const CLEANUP_INTERVAL = 120000; // 120秒清理间隔

/**
 * WebSocket同步服务器类
 */
class WebSocketSyncServer {
  constructor() {
    this.httpServer = null;
    this.wss = null;
    this.roomManager = new RoomManager();
    this.messageHandler = new MessageHandler(this.roomManager);
    this.heartbeatTimer = null;
    this.cleanupTimer = null;
    this.clientConnections = new Map(); // ws -> client映射
  }

  /**
   * 启动服务器
   */
  start() {
    try {
      // 创建HTTP服务器
      this.httpServer = createServer();
      
      // 创建WebSocket服务器
      this.wss = new WebSocketServer({ 
        server: this.httpServer,
        // 自定义验证函数
        verifyClient: this.verifyClient.bind(this)
      });

      // 设置WebSocket事件监听
      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleServerError.bind(this));

      // 启动HTTP服务器
      this.httpServer.listen(SERVER_PORT, SERVER_HOST, () => {
        console.log(formatLog('info', '🚀 WebSocket同步服务器启动成功', {
          host: SERVER_HOST,
          port: SERVER_PORT,
          url: `ws://${SERVER_HOST}:${SERVER_PORT}`
        }));
      });

      // 启动定时任务
      this.startHeartbeat();
      this.startCleanupTask();

      // 设置优雅关闭
      this.setupGracefulShutdown();

    } catch (error) {
      console.error(formatLog('error', '❌ 服务器启动失败', {
        error: error.message
      }));
      process.exit(1);
    }
  }

  /**
   * 验证客户端连接
   * @param {Object} info - 连接信息
   * @returns {boolean} 是否允许连接
   */
  verifyClient(info) {
    try {
      const params = parseConnectionParams(info.req.url);
      
      if (!params.isValid) {
        console.warn(formatLog('warn', '客户端连接参数无效', {
          url: info.req.url,
          origin: info.origin
        }));
        return false;
      }

      if (!validateActivationKey(params.activationKey)) {
        console.warn(formatLog('warn', '激活密钥无效', {
          key: params.activationKey,
          origin: info.origin
        }));
        return false;
      }

      if (!validateSyncMode(params.mode)) {
        console.warn(formatLog('warn', '同步模式无效', {
          mode: params.mode,
          origin: info.origin
        }));
        return false;
      }

      console.log(formatLog('info', '客户端连接验证通过', {
        activationKey: params.activationKey,
        mode: params.mode,
        sessionId: params.sessionId,
        origin: info.origin
      }));

      return true;
    } catch (error) {
      console.error(formatLog('error', '客户端验证异常', {
        error: error.message,
        url: info.req.url
      }));
      return false;
    }
  }

  /**
   * 处理新的WebSocket连接
   * @param {WebSocket} ws - WebSocket连接
   * @param {IncomingMessage} req - HTTP请求对象
   */
  handleConnection(ws, req) {
    try {
      // 解析连接参数
      const params = parseConnectionParams(req.url);
      
      // 添加客户端到房间管理器
      const client = this.roomManager.addClient(ws, params);
      
      // 建立ws与client的映射关系
      this.clientConnections.set(ws, client);

      // 发送欢迎消息和房间状态
      this.sendWelcomeMessage(client);
      this.messageHandler.sendRoomStatus(client);

      // 广播房间状态更新和对端状态
      this.messageHandler.broadcastRoomStatusUpdate(params.activationKey);
      this.messageHandler.broadcastPeerStatus(params.activationKey);

      // 设置WebSocket事件监听
      ws.on('message', (message) => {
        this.handleClientMessage(client, message);
      });

      ws.on('close', (code, reason) => {
        this.handleClientDisconnect(client, code, reason);
      });

      ws.on('error', (error) => {
        this.handleClientError(client, error);
      });

      ws.on('pong', () => {
        client.isAlive = true;
      });

      console.log(formatLog('info', '✅ 客户端连接建立', {
        clientId: client.id,
        activationKey: params.activationKey,
        mode: params.mode,
        totalClients: this.roomManager.clients.size
      }));

    } catch (error) {
      console.error(formatLog('error', '处理客户端连接异常', {
        error: error.message
      }));
      
      try {
        ws.close(1011, '服务器内部错误');
      } catch (closeError) {
        console.error('关闭连接失败:', closeError);
      }
    }
  }

  /**
   * 处理客户端消息
   * @param {Object} client - 客户端对象
   * @param {Buffer} message - 消息数据
   */
  handleClientMessage(client, message) {
    try {
      const messageStr = message.toString('utf8');
      this.messageHandler.handleMessage(client, messageStr);
    } catch (error) {
      console.error(formatLog('error', '处理客户端消息异常', {
        clientId: client.id,
        error: error.message
      }));
    }
  }

  /**
   * 处理客户端断开连接
   * @param {Object} client - 客户端对象
   * @param {number} code - 关闭代码
   * @param {string} reason - 关闭原因
   */
  handleClientDisconnect(client, code, reason) {
    try {
      console.log(formatLog('info', '客户端断开连接', {
        clientId: client.id,
        activationKey: client.activationKey,
        mode: client.mode,
        code,
        reason: reason.toString()
      }));

      const activationKey = client.activationKey;
      
      // 从房间管理器中移除客户端
      this.roomManager.removeClient(client.id);
      
      // 移除ws映射
      this.clientConnections.delete(client.ws);

      // 广播房间状态更新和对端状态
      this.messageHandler.broadcastRoomStatusUpdate(activationKey);
      this.messageHandler.broadcastPeerStatus(activationKey);

    } catch (error) {
      console.error(formatLog('error', '处理客户端断开异常', {
        error: error.message
      }));
    }
  }

  /**
   * 处理客户端错误
   * @param {Object} client - 客户端对象
   * @param {Error} error - 错误对象
   */
  handleClientError(client, error) {
    console.error(formatLog('error', '客户端连接错误', {
      clientId: client?.id || 'unknown',
      error: error.message
    }));
  }

  /**
   * 处理服务器错误
   * @param {Error} error - 错误对象
   */
  handleServerError(error) {
    console.error(formatLog('error', 'WebSocket服务器错误', {
      error: error.message
    }));
  }

  /**
   * 发送欢迎消息
   * @param {Object} client - 客户端对象
   */
  sendWelcomeMessage(client) {
    const welcomeMessage = {
      type: 'welcome',
      timestamp: Date.now(),
      data: {
        clientId: client.id,
        message: '🎉 欢迎连接到WebSocket同步服务器',
        serverInfo: {
          version: '1.0.0',
          features: ['speech_recognition_sync', 'room_management', 'heartbeat']
        }
      }
    };

    this.messageHandler.sendMessage(client, welcomeMessage);
  }

  /**
   * 启动心跳检测
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.roomManager.heartbeat();
      
      // 记录统计信息
      const stats = this.roomManager.getGlobalStats();
      console.log(formatLog('debug', '心跳检测完成', stats));
      
    }, HEARTBEAT_INTERVAL);

    console.log(formatLog('info', '❤️ 心跳检测已启动', {
      interval: HEARTBEAT_INTERVAL
    }));
  }

  /**
   * 启动清理任务
   */
  startCleanupTask() {
    this.cleanupTimer = setInterval(() => {
      this.roomManager.cleanupDisconnectedClients();
    }, CLEANUP_INTERVAL);

    console.log(formatLog('info', '🧹 清理任务已启动', {
      interval: CLEANUP_INTERVAL
    }));
  }

  /**
   * 设置优雅关闭
   */
  setupGracefulShutdown() {
    const gracefulShutdown = () => {
      console.log(formatLog('info', '正在优雅关闭服务器...'));
      
      // 清除定时器
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
      }
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }

      // 关闭所有WebSocket连接
      if (this.wss) {
        this.wss.clients.forEach(ws => {
          ws.close(1001, '服务器正在关闭');
        });
      }

      // 关闭HTTP服务器
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log(formatLog('info', '服务器已优雅关闭'));
          process.exit(0);
        });
      }
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }

  /**
   * 获取服务器状态
   * @returns {Object} 服务器状态信息
   */
  getServerStatus() {
    const globalStats = this.roomManager.getGlobalStats();
    
    return {
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: globalStats,
      timestamp: Date.now()
    };
  }
}

// 启动服务器
const server = new WebSocketSyncServer();
server.start();

export default WebSocketSyncServer; 