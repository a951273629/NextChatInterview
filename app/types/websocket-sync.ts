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
  type: "speech_recognition" | "ping" | "pong";
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

// WebSocket Hook 返回类型
export interface UseWebSocketSyncReturn {
  // 状态
  connectionStatus: ConnectionStatus;
  connectedClients: number;
  lastError?: string;

  // 方法
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => void;
  sendSpeechRecognition: (data: SpeechRecognitionData) => void;

  // 回调设置
  onSpeechRecognition?: (data: SpeechRecognitionData) => void;
}

// 常量
export const ACTIVATION_KEY_STRING = "user_activation_key_string";
export const DEFAULT_WEBSOCKET_URL = "ws://localhost:8080";
