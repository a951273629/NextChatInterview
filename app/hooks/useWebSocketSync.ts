import { useState, useCallback, useRef } from "react";
import useWebSocket from "react-use-websocket";
import {
  ConnectionStatus,
  SyncMode,
  WebSocketMessage,

  LLMResponseData,
  LLMResponseMessage,

  PeerStatusData,
  PeerStatusUpdateMessage,
  
  WelcomeData,
  WelcomeMessage,
  ErrorData,
  ErrorMessage,
  RoomStatusData,
  RoomStatusMessage,
  RoomStatusUpdateMessage,
  
  UseWebSocketSyncReturn,
  DEFAULT_WEBSOCKET_URL,
} from "@/app/types/websocket-sync";

import { nanoid } from "nanoid";

interface UseWebSocketSyncOptions {
  openId: string;
  mode: SyncMode;
  enabled: boolean;
  onLLMResponse?: (data: LLMResponseData) => void;          // 新增：LLM回答回调
  onPeerStatusChange?: (peerStatus: PeerStatusData) => void;
  onWelcome?: (data: WelcomeData) => void;                 // 新增：欢迎消息回调
  onError?: (data: ErrorData) => void;                     // 新增：错误消息回调
  onRoomStatus?: (data: RoomStatusData) => void;           // 新增：房间状态回调
  onRoomStatusUpdate?: (data: RoomStatusData) => void;     // 新增：房间状态更新回调
  serverUrl?: string;
}

export const useWebSocketSync = ({
  openId,
  mode,
  enabled,
  onLLMResponse,
  onPeerStatusChange,
  onWelcome,
  onError,
  onRoomStatus,
  onRoomStatusUpdate,
  serverUrl = DEFAULT_WEBSOCKET_URL,
}: UseWebSocketSyncOptions): UseWebSocketSyncReturn => {

  // 状态管理
  const [connectedClients, setConnectedClients] = useState(0);
  const [lastError, setLastError] = useState<string | undefined>();
  const [peerStatus, setPeerStatus] = useState<PeerStatusData | undefined>();
  const [roomStatus, setRoomStatus] = useState<RoomStatusData | undefined>();
  const [clientId, setClientId] = useState<string | undefined>();
  const sessionIdRef = useRef<string>(nanoid());

  // WebSocket URL，使用openId作为密钥
  const socketUrl = enabled
    ? `${serverUrl}?key=${encodeURIComponent(
       openId,
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
          console.log("📨 收到WebSocket消息 Type:", message.type);
          // console.log("收到WebSocket消息 Type:", message.type);
          switch (message.type) {


            case "llm_response":
              // console.log("🤖 接收端处理LLM回答消息 llm_response:", message.data);
              const llmMessage = message as LLMResponseMessage;
              if (mode === SyncMode.RECEIVER && onLLMResponse) {
                onLLMResponse(llmMessage.data);
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
              // console.log("👥 收到对端状态更新:", peerStatusMessage.data);
              setPeerStatus(peerStatusMessage.data.peerStatus);
              if (onPeerStatusChange) {
                onPeerStatusChange(peerStatusMessage.data.peerStatus);
              }
              break;

            case "welcome":
              const welcomeMessage = message as WelcomeMessage;
              console.log("🎉 收到欢迎消息:", welcomeMessage.data);
              setClientId(welcomeMessage.data.clientId);
              if (onWelcome) {
                onWelcome(welcomeMessage.data);
              }
              break;

            case "error":
              const errorMessage = message as ErrorMessage;
              console.error("❌ 收到错误消息:", errorMessage.data);
              setLastError(`${errorMessage.data.code}: ${errorMessage.data.message}`);
              if (onError) {
                onError(errorMessage.data);
              }
              break;

            case "room_status":
              const roomStatusMessage = message as RoomStatusMessage;
              console.log("🏠 收到房间状态:", roomStatusMessage.data);
              setRoomStatus(roomStatusMessage.data);
              if (onRoomStatus) {
                onRoomStatus(roomStatusMessage.data);
              }
              break;

            case "room_status_update":
              const roomStatusUpdateMessage = message as RoomStatusUpdateMessage;
              console.log("🔄 收到房间状态更新:", roomStatusUpdateMessage.data);
              setRoomStatus(roomStatusUpdateMessage.data);
              if (onRoomStatusUpdate) {
                onRoomStatusUpdate(roomStatusUpdateMessage.data);
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



  // 🔧 使用useRef创建稳定的发送函数，避免依赖变化导致的重复注册
  const sendLLMResponseRef = useRef<(data: LLMResponseData) => void>();

  // 更新函数引用，但保持函数本身稳定
  sendLLMResponseRef.current = (data: LLMResponseData) => {
    // console.log("🤖 sendLLMResponse调用状态:", {
    //   mode,
    //   actualWebSocketState: getWebSocket()?.readyState,
    //   isConnected: isConnected(),
    // });

    if (mode !== SyncMode.SENDER) {
      console.warn("⚠️ 非发送端模式，无法发送LLM回答消息");
      return;
    }

    if (!isConnected()) {
      console.warn("⚠️ WebSocket未连接，无法发送LLM回答消息", {
        actualState: getWebSocket()?.readyState,
      });
      return;
    }

    const message: LLMResponseMessage = {
      type: "llm_response",
      timestamp: Date.now(),
      data: {
        ...data,
        sessionId: sessionIdRef.current,
      },
    };

    // console.log("📤 发送LLM回答消息:", message);
    sendMessage(JSON.stringify(message));
  };

  // 提供稳定的函数引用
  const sendLLMResponse = useCallback((data: LLMResponseData) => {
    sendLLMResponseRef.current?.(data);
  }, []); // 🔧 空依赖数组确保函数引用永远稳定



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
    roomStatus,
    clientId,

    // 实时状态获取方法
    getConnectionStatus,
    isConnected,

    // 方法
    connect,
    disconnect,
    sendMessage: sendMessageWrapper,
    sendLLMResponse,                // 新增：发送LLM回答方法

    // 回调
    onLLMResponse,                  // 新增：LLM回答回调
    onPeerStatusChange,
    onWelcome,                      // 新增：欢迎消息回调
    onError,                        // 新增：错误消息回调
    onRoomStatus,                   // 新增：房间状态回调
    onRoomStatusUpdate,             // 新增：房间状态更新回调
  };
};
