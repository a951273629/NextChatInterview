// WebSocket 同步功能相关类型定义

// 同步模式枚举
export enum SyncMode {
  SENDER = "sender", // 发送端
  RECEIVER = "receiver", // 接收端
}

// WebSocket 连接状态
export enum ConnectionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

// WebSocket 消息类型
export interface WebSocketMessage {
  type: "speech_recognition" | "ping" | "pong" | "peer_status_update" | "room_status_update" | "data_sync";
  timestamp: number;
  data: any;
}

// 语音识别消息数据
export interface SpeechRecognitionData {
  text: string;
  isFinal: boolean;
  language: string;
  sessionId: string;
}

// 语音识别消息
export interface SpeechRecognitionMessage extends WebSocketMessage {
  type: "speech_recognition";
  data: SpeechRecognitionData;
}

// 对端状态数据
export interface PeerStatusData {
  connected: boolean;
  count: number;
  mode: "sender" | "receiver";
  clients: Array<{
    id: string;
    sessionId: string;
    joinTime: number;
  }>;
}

// 对端状态更新消息
export interface PeerStatusUpdateMessage extends WebSocketMessage {
  type: "peer_status_update";
  data: {
    peerStatus: PeerStatusData;
    roomStats: {
      total: number;
      senders: number;
      receivers: number;
    };
  };
}

// 同步配置
export interface SyncConfig {
  enabled: boolean;
  mode: SyncMode;
  activationKey: string;
}

// WebSocket 同步状态
export interface WebSocketSyncState {
  connectionStatus: ConnectionStatus;
  connectedClients: number;
  lastError?: string;
  lastMessageTime?: number;
}

// 数据同步消息数据
export interface DataSyncData {
  // 基础信息
  activationKey: string;
  resumeContent?: string;
  resumeFileName?: string;
  
  // 扩展字段，保持向后兼容性
  additionalData?: {
    openId?: string;
    userId?: string;
    [key: string]: any; // 允许未来扩展其他字段
  };
  
  // 元数据
  syncType: "full" | "partial"; // 同步类型：完整或部分
  sessionId: string;
}

// 数据同步消息
export interface DataSyncMessage extends WebSocketMessage {
  type: "data_sync";
  data: DataSyncData;
}

// WebSocket Hook 返回类型
export interface UseWebSocketSyncReturn {
  // 状态
  connectionStatus: ConnectionStatus;
  connectedClients: number;
  lastError?: string;
  peerStatus?: PeerStatusData;

  // 实时状态获取方法
  getConnectionStatus: () => ConnectionStatus;
  isConnected: () => boolean;

  // 方法
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => void;
  sendSpeechRecognition: (data: SpeechRecognitionData) => void;
  sendDataSync: (data: DataSyncData) => void;

  // 回调设置
  onSpeechRecognition?: (data: SpeechRecognitionData) => void;
  onPeerStatusChange?: (peerStatus: PeerStatusData) => void;
  onDataSync?: (data: DataSyncData) => void;
}

// 常量
export const ACTIVATION_KEY_STRING = "user_activation_key_string";
export const DEFAULT_WEBSOCKET_URL =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:8080"
    : "wss://mianshiyang.cn/ws/";