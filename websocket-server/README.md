# WebSocket 同步服务器

这是一个用于语音识别同步功能的WebSocket服务器，支持发送端和接收端之间的实时消息传递。

## 功能特性

- 🎯 **房间管理**: 基于激活密钥的房间隔离
- 📡 **消息路由**: 发送端到接收端的消息转发
- ❤️ **心跳检测**: 自动检测和清理断开的连接
- 🔒 **参数验证**: 连接参数和消息格式验证
- 📊 **状态监控**: 实时连接统计和房间状态

## 项目结构

```
websocket-server/
├── package.json          # 服务器端依赖配置
├── server.js             # 主服务器文件
├── roomManager.js        # 房间和客户端连接管理
├── messageHandler.js     # 消息处理和路由逻辑
├── utils.js              # 工具函数
└── README.md            # 使用说明
```

## 安装和启动

### 方法1: 从主项目启动（推荐）

```bash
# 安装WebSocket服务器依赖
yarn ws:install

# 启动WebSocket服务器
yarn ws:start

# 同时启动Next.js应用和WebSocket服务器
yarn dev:with-ws
```

### 方法2: 独立启动

```bash
# 进入服务器目录
cd websocket-server

# 安装依赖
npm install

# 启动服务器
npm start

# 开发模式（文件变化自动重启）
npm run dev
```

## 环境变量

可以通过环境变量配置服务器：

```bash
# WebSocket服务器端口（默认: 8080）
WS_PORT=8080

# WebSocket服务器主机（默认: localhost）
WS_HOST=localhost

# 运行环境（development/production）
NODE_ENV=development
```

## 连接参数

客户端连接WebSocket服务器时需要提供以下查询参数：

```
ws://localhost:8080/?key={ACTIVATION_KEY}&mode={MODE}&sessionId={SESSION_ID}
```

### 参数说明

- **key**: 激活密钥，用于房间隔离（必需）
- **mode**: 客户端模式，`sender`（发送端）或 `receiver`（接收端）（必需）
- **sessionId**: 会话ID，客户端唯一标识（必需）

### 示例

```javascript
// 发送端连接
const senderWs = new WebSocket('ws://localhost:8080/?key=user_activation_key_string&mode=sender&sessionId=abc123');

// 接收端连接
const receiverWs = new WebSocket('ws://localhost:8080/?key=user_activation_key_string&mode=receiver&sessionId=def456');
```

## 消息格式

### 语音识别消息（发送端 -> 接收端）

```json
{
  "type": "speech_recognition",
  "timestamp": 1640995200000,
  "data": {
    "text": "识别到的语音文本",
    "isFinal": true,
    "language": "zh-CN",
    "sessionId": "abc123"
  }
}
```

### 心跳消息

```json
{
  "type": "ping",
  "timestamp": 1640995200000,
  "data": {}
}
```

### 错误消息

```json
{
  "type": "error",
  "timestamp": 1640995200000,
  "data": {
    "error": "错误描述信息"
  }
}
```

### 房间状态消息

```json
{
  "type": "room_status",
  "timestamp": 1640995200000,
  "data": {
    "roomStats": {
      "total": 3,
      "senders": 1,
      "receivers": 2,
      "exists": true
    },
    "clientInfo": {
      "id": "sender_abc123_1640995200000",
      "mode": "sender",
      "sessionId": "abc123",
      "joinTime": 1640995200000
    }
  }
}
```

## 工作流程

1. **连接建立**: 
   - 客户端连接时验证参数
   - 创建客户端对象并加入对应房间
   - 发送欢迎消息和房间状态

2. **消息处理**:
   - 发送端发送语音识别消息
   - 服务器验证消息格式
   - 转发消息给同房间的所有接收端

3. **连接管理**:
   - 定期心跳检测
   - 自动清理断开的连接
   - 实时更新房间状态

## 开发和调试

### 日志级别

服务器输出不同级别的日志：

- `INFO`: 一般信息（连接、断开、消息处理）
- `WARN`: 警告信息（验证失败、异常情况）
- `ERROR`: 错误信息（处理异常、连接错误）
- `DEBUG`: 调试信息（心跳、详细状态）

### 常见问题

1. **连接失败**: 检查参数是否正确，服务器是否启动
2. **消息未转发**: 确认房间内有接收端，检查激活密钥是否匹配
3. **频繁断线**: 检查网络稳定性，确认心跳机制正常

## API参考

### RoomManager 类

- `addClient(ws, params)`: 添加客户端到房间
- `removeClient(clientId)`: 从房间移除客户端
- `getReceivers(activationKey)`: 获取房间内接收端
- `broadcastToReceivers(activationKey, message)`: 广播消息到接收端

### MessageHandler 类

- `handleMessage(client, messageStr)`: 处理客户端消息
- `sendMessage(client, message)`: 发送消息给客户端
- `forwardToReceivers(activationKey, message, senderClientId)`: 转发消息给接收端

## 许可证

MIT License 