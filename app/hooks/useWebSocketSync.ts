import { useState, useCallback, useRef, useEffect } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import {
  ConnectionStatus,
  SyncMode,
  WebSocketMessage,
  SpeechRecognitionData,
  SpeechRecognitionMessage,
  UseWebSocketSyncReturn,
  ACTIVATION_KEY_STRING,
  DEFAULT_WEBSOCKET_URL,
} from "@/app/types/websocket-sync";
import { nanoid } from "nanoid";

interface UseWebSocketSyncOptions {
  activationKey?: string;
  mode: SyncMode;
  enabled: boolean;
  onSpeechRecognition?: (data: SpeechRecognitionData) => void;
  serverUrl?: string;
}

export const useWebSocketSync = ({
  activationKey = ACTIVATION_KEY_STRING,
  mode,
  enabled,
  onSpeechRecognition,
  serverUrl = DEFAULT_WEBSOCKET_URL,
}: UseWebSocketSyncOptions): UseWebSocketSyncReturn => {
  // 状态管理
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.DISCONNECTED,
  );
  const [connectedClients, setConnectedClients] = useState(0);
  const [lastError, setLastError] = useState<string | undefined>();
  const sessionIdRef = useRef<string>(nanoid());

  // WebSocket URL，包含激活密钥
  const socketUrl = enabled
    ? `${serverUrl}?key=${encodeURIComponent(
        activationKey,
      )}&mode=${mode}&sessionId=${sessionIdRef.current}`
    : null;

  // 使用 react-use-websocket
  const { sendMessage, lastMessage, readyState } = useWebSocket(socketUrl, {
    onOpen: () => {
      console.log("🔗 WebSocket连接已建立");
      setConnectionStatus(ConnectionStatus.CONNECTED);
      setLastError(undefined);
    },
    onClose: () => {
      console.log("🔒 WebSocket连接已关闭");
      setConnectionStatus(ConnectionStatus.DISCONNECTED);
    },
    onError: (event: Event) => {
      console.error("❌ WebSocket连接错误:", event);
      setConnectionStatus(ConnectionStatus.ERROR);
      setLastError("连接错误");
    },
    onMessage: (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log("📨 收到WebSocket消息:", message);

        switch (message.type) {
          case "speech_recognition":
            const speechMessage = message as SpeechRecognitionMessage;
            if (mode === SyncMode.RECEIVER && onSpeechRecognition) {
              console.log("🎯 接收端处理语音识别消息:", speechMessage.data);
              onSpeechRecognition(speechMessage.data);
            }
            break;

          case "ping":
            // 响应心跳
            const pongMessage = JSON.stringify({
              type: "pong",
              timestamp: Date.now(),
              data: null,
            });
            sendMessage(pongMessage);
            break;

          case "pong":
            // 收到心跳响应
            console.log("💓 收到心跳响应");
            break;

          default:
            console.warn("未知消息类型:", message.type);
        }
      } catch (error) {
        console.error("解析WebSocket消息失败:", error);
        setLastError("消息解析失败");
      }
    },
    // 重连配置
    shouldReconnect: (closeEvent) => {
      console.log("🔄 WebSocket断开，准备重连:", closeEvent);
      return enabled; // 只有在启用状态下才重连
    },
    reconnectAttempts: 100,
    reconnectInterval: 5000,
  });

  // 监听连接状态变化
  useEffect(() => {
    switch (readyState) {
      case ReadyState.CONNECTING:
        setConnectionStatus(ConnectionStatus.CONNECTING);
        break;
      case ReadyState.OPEN:
        setConnectionStatus(ConnectionStatus.CONNECTED);
        break;
      case ReadyState.CLOSING:
      case ReadyState.CLOSED:
        setConnectionStatus(ConnectionStatus.DISCONNECTED);
        break;
      default:
        setConnectionStatus(ConnectionStatus.ERROR);
    }
  }, [readyState]);

  // 发送语音识别消息
  const sendSpeechRecognition = useCallback(
    (data: SpeechRecognitionData) => {
      if (mode !== SyncMode.SENDER) {
        console.warn("⚠️ 非发送端模式，无法发送语音识别消息");
        return;
      }

      if (readyState !== ReadyState.OPEN) {
        console.warn("⚠️ WebSocket未连接，无法发送消息");
        return;
      }

      const message: SpeechRecognitionMessage = {
        type: "speech_recognition",
        timestamp: Date.now(),
        data: {
          ...data,
          sessionId: sessionIdRef.current,
        },
      };

      console.log("📤 发送语音识别消息:", message);
      sendMessage(JSON.stringify(message));
    },
    [mode, readyState, sendMessage],
  );

  // 通用消息发送
  const sendMessageWrapper = useCallback(
    (message: WebSocketMessage) => {
      if (readyState !== ReadyState.OPEN) {
        console.warn("⚠️ WebSocket未连接，无法发送消息");
        return;
      }

      console.log("📤 发送WebSocket消息:", message);
      sendMessage(JSON.stringify(message));
    },
    [readyState, sendMessage],
  );

  // 手动连接和断开
  const connect = useCallback(() => {
    console.log("🔗 手动连接WebSocket");
    // react-use-websocket 会自动处理连接
    setLastError(undefined);
  }, []);

  const disconnect = useCallback(() => {
    console.log("🔒 手动断开WebSocket");
    // react-use-websocket 通过设置 socketUrl 为 null 来断开连接
    setConnectionStatus(ConnectionStatus.DISCONNECTED);
  }, []);

  return {
    // 状态
    connectionStatus,
    connectedClients,
    lastError,

    // 方法
    connect,
    disconnect,
    sendMessage: sendMessageWrapper,
    sendSpeechRecognition,

    // 回调
    onSpeechRecognition,
  };
};
