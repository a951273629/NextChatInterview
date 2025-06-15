import { useState, useCallback, useRef } from "react";
import useWebSocket from "react-use-websocket";
import {
  ConnectionStatus,
  SyncMode,
  WebSocketMessage,
  SpeechRecognitionData,
  SpeechRecognitionMessage,
  PeerStatusData,
  PeerStatusUpdateMessage,
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
  onPeerStatusChange?: (peerStatus: PeerStatusData) => void;
  serverUrl?: string;
}

export const useWebSocketSync = ({
  activationKey = localStorage.getItem(ACTIVATION_KEY_STRING) || "",
  mode,
  enabled,
  onSpeechRecognition,
  onPeerStatusChange,
  serverUrl = DEFAULT_WEBSOCKET_URL,
}: UseWebSocketSyncOptions): UseWebSocketSyncReturn => {
  // 状态管理
  const [connectedClients, setConnectedClients] = useState(0);
  const [lastError, setLastError] = useState<string | undefined>();
  const [peerStatus, setPeerStatus] = useState<PeerStatusData | undefined>();
  const sessionIdRef = useRef<string>(nanoid());

  // WebSocket URL，包含激活密钥
  const socketUrl = enabled
    ? `${serverUrl}?key=${encodeURIComponent(
        activationKey,
      )}&mode=${mode}&sessionId=${sessionIdRef.current}`
    : null;

  // 使用 react-use-websocket
  const { sendMessage, lastMessage, readyState, getWebSocket } = useWebSocket(
    socketUrl,
    {
      onOpen: () => {
        console.log("🔗 WebSocket连接已建立");
        setLastError(undefined);
      },
      onClose: () => {
        console.log("🔒 WebSocket连接已关闭");
      },
      onError: (event: Event) => {
        console.error("❌ WebSocket连接错误:", event);
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

            case "peer_status_update":
              const peerStatusMessage = message as PeerStatusUpdateMessage;
              console.log("👥 收到对端状态更新:", peerStatusMessage.data);
              setPeerStatus(peerStatusMessage.data.peerStatus);
              if (onPeerStatusChange) {
                onPeerStatusChange(peerStatusMessage.data.peerStatus);
              }
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
    },
  );

  // 实时状态获取函数
  const getConnectionStatus = useCallback((): ConnectionStatus => {
    const ws = getWebSocket();
    if (!ws) return ConnectionStatus.DISCONNECTED;

    switch (ws.readyState) {
      case WebSocket.CONNECTING:
        return ConnectionStatus.CONNECTING;
      case WebSocket.OPEN:
        return ConnectionStatus.CONNECTED;
      case WebSocket.CLOSING:
        return ConnectionStatus.DISCONNECTED;
      case WebSocket.CLOSED:
        return ConnectionStatus.DISCONNECTED;
      default:
        return ConnectionStatus.ERROR;
    }
  }, [getWebSocket]);

  // 简化的连接状态检查函数
  const isConnected = useCallback((): boolean => {
    const ws = getWebSocket();
    return ws?.readyState === WebSocket.OPEN;
  }, [getWebSocket]);

  // 发送语音识别消息
  const sendSpeechRecognition = useCallback(
    (data: SpeechRecognitionData) => {
      console.log("🎤 sendSpeechRecognition调用状态:", {
        mode,
        actualWebSocketState: getWebSocket()?.readyState,
        isConnected: isConnected(),
      });

      if (mode !== SyncMode.SENDER) {
        console.warn("⚠️ 非发送端模式，无法发送语音识别消息");
        return;
      }

      if (!isConnected()) {
        console.warn("⚠️ WebSocket未连接，无法发送消息", {
          actualState: getWebSocket()?.readyState,
        });
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
    [mode, sendMessage, isConnected, getWebSocket],
  );

  // 通用消息发送
  const sendMessageWrapper = useCallback(
    (message: WebSocketMessage) => {
      console.log("📤 sendMessage调用状态:", {
        actualWebSocketState: getWebSocket()?.readyState,
        isConnected: isConnected(),
      });

      if (!isConnected()) {
        console.warn("⚠️ WebSocket未连接，无法发送消息", {
          actualState: getWebSocket()?.readyState,
        });
        return;
      }

      console.log("📤 发送WebSocket消息:", message);
      sendMessage(JSON.stringify(message));
    },
    [sendMessage, isConnected, getWebSocket],
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
  }, []);

  return {
    // 状态
    connectionStatus: getConnectionStatus(),
    connectedClients,
    lastError,
    peerStatus,

    // 实时状态获取方法
    getConnectionStatus,
    isConnected,

    // 方法
    connect,
    disconnect,
    sendMessage: sendMessageWrapper,
    sendSpeechRecognition,

    // 回调
    onSpeechRecognition,
    onPeerStatusChange,
  };
};
