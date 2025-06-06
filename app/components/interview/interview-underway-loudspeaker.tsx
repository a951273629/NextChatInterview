import React, { useRef, useState, useEffect } from "react";
import StopIcon from "@/app/icons/pause.svg";
import styles from "./interview-underway-loudspeaker.module.scss";
import {
  AzureSpeechRecognizer,
  getAzureSpeechConfig,
  isAzureSpeechAvailable,
} from "@/app/components/interview/azureSpeech";
import { SyncMode } from "@/app/types/websocket-sync";
import { useWebSocketSync } from "@/app/hooks/useWebSocketSync";
import { nanoid } from "nanoid";

// 消息类型接口
interface Message {
  id: string;
  text: string;
  timestamp: number;
}

interface InterviewUnderwayLoudspeakerProps {
  // 控制状态
  visible: boolean;
  recognitionLanguage: string;

  // 回调函数
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
  onStop: () => void;

  // 可选：默认自动提交状态（扬声器模式下默认开启）
  defaultAutoSubmit?: boolean;

  // 媒体流相关props
  mediaStream: MediaStream | null;
  //   audioContext: AudioContext | null;
  onRequestPermission: () => Promise<void>;

  // 同步功能相关props
  syncEnabled?: boolean;
  syncMode?: SyncMode;
  activationKey?: string;

  // 移动端相关
  onMinimize?: () => void;
  isMobile?: boolean;

  // 消息管理
  messages?: Message[];
  onAddMessage?: (text: string) => void;
}

export const InterviewUnderwayLoudspeaker: React.FC<
  InterviewUnderwayLoudspeakerProps
> = ({
  visible,
  recognitionLanguage,
  onTextUpdate,
  submitMessage,
  onStop,
  defaultAutoSubmit = false,
  mediaStream,
  //   audioContext,
  onRequestPermission,
  syncEnabled = false,
  syncMode = SyncMode.SENDER,
  activationKey,
  onMinimize,
  isMobile = false,
  messages = [],
  onAddMessage,
}) => {
  // 语音识别相关状态
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [browserSupportsApi, setBrowserSupportsApi] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(false);
  const transcriptRef = useRef(transcript);

  // Azure Speech 识别器引用
  const azureSpeechRecognizerRef = useRef<AzureSpeechRecognizer | null>(null);

  // 控制状态
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoSubmit, setIsAutoSubmit] = useState(defaultAutoSubmit);
  const [showTooltip, setShowTooltip] = useState(true);

  // 消息相关 - 移除内部状态，使用外部传入的
  // const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSubmittedTextRef = useRef("");
  const autoSubmitTimerRef = useRef<NodeJS.Timeout | null>(null);

  // WebSocket 同步功能
  const webSocketSync = useWebSocketSync({
    activationKey: activationKey || "default_key",
    mode: syncMode,
    enabled: syncEnabled && visible,
    onSpeechRecognition: (data) => {
      // 接收端处理逻辑：自动提交接收到的语音识别结果
      if (syncMode === SyncMode.RECEIVER) {
        console.log("🎯 接收到同步的语音识别结果:", data);
        // 直接提交消息，不经过本地识别流程
        submitMessage(data.text);
        // 可选：也添加到消息历史
        onAddMessage?.(data.text);
      }
    },
  });

  // 检查浏览器支持
  useEffect(() => {
    const checkBrowserSupport = () => {
      const hasGetDisplayMedia = !!(
        navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia
      );
      const hasAudioContext = !!(
        window.AudioContext || window.webkitAudioContext
      );
      const hasAzureSpeech = isAzureSpeechAvailable();

      setBrowserSupportsApi(
        hasGetDisplayMedia && hasAudioContext && hasAzureSpeech,
      );

      if (!hasAzureSpeech) {
        console.warn("Azure Speech SDK 不可用，请检查配置");
      }
    };

    checkBrowserSupport();
  }, []);

  // 初始化 Azure Speech 识别器
  const initializeAzureSpeechRecognizer = () => {
    try {
      if (!mediaStream) {
        throw new Error("MediaStream 未准备就绪");
      }

      console.log("🔧 准备初始化 Azure Speech 识别器...");
      const config = getAzureSpeechConfig();
      // 根据识别语言设置配置
      config.language = recognitionLanguage;

      const recognizer = new AzureSpeechRecognizer(config);

      // 设置音频流（现在是同步方法）
      recognizer.createAudioConfigFromStream(mediaStream);

      azureSpeechRecognizerRef.current = recognizer;

      return recognizer;
    } catch (error) {
      console.error("❌ 初始化 Azure Speech 识别器失败:", error);
      throw error;
    }
  };

  // 开始语音识别（使用 Azure Speech SDK）
  const startSpeechRecognition = () => {
    if (!mediaStream) {
      console.log("⚠️ 媒体流未准备就绪，请先获取录屏权限");
      return;
    }

    try {
      console.log("🚀 开始 Azure 语音识别...");

      // 初始化 Azure Speech 识别器
      const recognizer = initializeAzureSpeechRecognizer();

      // 开始连续识别
      recognizer.startContinuousRecognition(
        // 识别结果回调
        (text: string, isFinal: boolean) => {
          console.log(
            `🎯 Azure 识别结果 (${isFinal ? "✅最终" : "🔄中间"}):`,
            text,
          );
          setTranscript(text);
          transcriptRef.current = text;
          onTextUpdate(text);

          // 如果启用同步功能且为发送端，则发送识别结果
          if (
            syncEnabled &&
            syncMode === SyncMode.SENDER &&
            isFinal &&
            text.trim()
          ) {
            console.log("📤 发送端模式：通过WebSocket发送语音识别结果");
            webSocketSync.sendSpeechRecognition({
              text: text.trim(),
              isFinal,
              language: recognitionLanguage,
              sessionId: nanoid(),
            });
          }
        },
        // 错误回调
        (error: string) => {
          console.error("❌ Azure 语音识别错误:", error);
          setListening(false);
          setAudioAvailable(false);
        },
        // 结束回调
        () => {
          console.log("🏁 Azure 语音识别结束");
          // 如果应该继续监听但识别结束了，重新启动
          if (visible && !isPaused && audioAvailable && mediaStream) {
            setTimeout(() => {
              console.log("🔄 重新启动语音识别...");
              startSpeechRecognition();
            }, 1000);
          } else {
            setListening(false);
          }
        },
      );

      setListening(true);
      setAudioAvailable(true);
    } catch (error: any) {
      console.error("❌ 启动 Azure 语音识别失败:", error);
      setAudioAvailable(false);
      setListening(false);
    }
  };

  // 停止语音识别
  const stopSpeechRecognition = () => {
    try {
      // 停止 Azure Speech 识别器
      if (azureSpeechRecognizerRef.current) {
        azureSpeechRecognizerRef.current.stopRecognition();
        azureSpeechRecognizerRef.current.dispose();
        azureSpeechRecognizerRef.current = null;
      }

      setListening(false);
      setAudioAvailable(false);
    } catch (error) {
      console.error("停止 Azure 语音识别失败:", error);
    }
  };

  // 重置转录文本
  const resetTranscript = () => {
    setTranscript("");
    transcriptRef.current = "";
    onTextUpdate("");
  };

  // 将transcript更新到父组件
  useEffect(() => {
    transcriptRef.current = transcript;
    onTextUpdate(transcript);
  }, [transcript, onTextUpdate]);

  // 滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 每当消息列表更新时，滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);



  // 消息点击处理函数
  const handleMessageClick = (messageText: string) => {
    console.log("消息被点击:", messageText);
    submitMessage(messageText);
    
    // 在移动端模式下，点击消息后最小化页面
    if (isMobile && onMinimize) {
      onMinimize();
    }
  };

  // 当组件可见且未暂停时开始音频捕获
  useEffect(() => {
    if (visible && !isPaused && browserSupportsApi && mediaStream) {
      console.log("useEffect: 开始语音识别");
      startSpeechRecognition();
    } else {
      console.log("useEffect: 停止语音识别");
      stopSpeechRecognition();
    }

    return () => {
      // 组件卸载时清理
      stopSpeechRecognition();
    };
  }, [visible, isPaused, browserSupportsApi, mediaStream]);

  // 自动提交扬声器语音（扬声器模式下所有音频都被视为面试官音频）
  useEffect(() => {
    // 清除之前的计时器
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }

    // 如果有文本内容
    if (transcript && transcript.trim() !== "") {
      // 设置一个短暂的延迟，确保收集到完整的句子
      autoSubmitTimerRef.current = setTimeout(() => {
        // 只有当transcript没有变化时才处理，避免句子还在形成过程中就处理
        if (transcript === transcriptRef.current) {
          // 扬声器模式下，所有语音都来自系统音频
          if (transcript !== lastSubmittedTextRef.current) {
            console.log("检测到扬声器音频，添加到消息历史:", transcript);
            onAddMessage?.(transcript); // 简化调用，不需要传递说话者标识
            lastSubmittedTextRef.current = transcript;
            resetTranscript();

            // 如果启用同步功能且为发送端，不进行本地提交，只通过WebSocket发送
            if (syncEnabled && syncMode === SyncMode.SENDER) {
              console.log(
                "📤 发送端模式：语音已通过WebSocket发送，跳过本地提交",
              );
            } else if (isAutoSubmit) {
              // 普通模式或接收端模式下的本地自动提交
              console.log("自动提交扬声器语音:", transcript);
              submitMessage(transcript);
            }
          }
        }
      }, 1800); // 1.8秒延迟
    }

    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, [transcript, submitMessage, isAutoSubmit, syncEnabled, syncMode]);

  // 暂停/恢复功能
  const togglePauseCommit = () => {
    if (!isPaused) {
      stopSpeechRecognition();
      resetTranscript();
    } else {
      startSpeechRecognition();
      resetTranscript();
    }
    setIsPaused(!isPaused);
  };

  // 停止识别
  const stopRecognition = () => {
    try {
      stopSpeechRecognition();
      onStop();
    } catch (error) {
      console.error("停止系统音频捕获失败:", error);
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
      stopSpeechRecognition();
    };
  }, []);

  return (
    <>
      {/* 语音识别状态指示器 */}
      <div className={styles.statusIndicator}>
        <div
          className={`${styles.indicatorDot} ${
            listening ? styles.listening : styles.notListening
          }`}
        />
        <span className={styles.statusText}>
          {listening ? "正在监听扬声器..." : isPaused ? "已暂停" : "未监听"}
        </span>

        {/* 添加可点击提示气泡 */}
        {showTooltip && (
          <div className={styles.clickableTooltip}>
            <div className={styles.tooltipContent}>单击下面的消息获取回答</div>
            <button
              className={styles.tooltipCloseBtn}
              onClick={() => setShowTooltip(false)}
            >
              ✕
            </button>
          </div>
        )}

        {/* 扬声器模式标识 */}
        <div className={styles.modeStatus}>
          <span className={`${styles.identityIndicator} ${styles.interviewer}`}>
            扬声器模式
          </span>
          <span className={styles.audioSource}>音频源: 系统扬声器</span>

          {/* WebSocket 同步状态 */}
          {syncEnabled && (
            <div className={styles.syncStatus}>
              <span
                className={`${styles.syncIndicator} ${
                  webSocketSync.connectionStatus === "connected"
                    ? styles.connected
                    : webSocketSync.connectionStatus === "connecting"
                    ? styles.connecting
                    : styles.disconnected
                }`}
              >
                {webSocketSync.connectionStatus === "connected"
                  ? "🟢"
                  : webSocketSync.connectionStatus === "connecting"
                  ? "🟡"
                  : "🔴"}
              </span>
              <span className={styles.syncText}>
                {syncMode === SyncMode.SENDER ? "发送端" : "接收端"} -
                {webSocketSync.connectionStatus === "connected"
                  ? "已连接"
                  : webSocketSync.connectionStatus === "connecting"
                  ? "连接中"
                  : "未连接"}
              </span>
              {webSocketSync.lastError && (
                <span className={styles.syncError}>
                  错误: {webSocketSync.lastError}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {(!browserSupportsApi ||
        (!mediaStream && !audioAvailable && syncMode === SyncMode.SENDER)) && (
        <div className={styles.errorMessage}>
          {!browserSupportsApi ? (
            "您的浏览器不支持系统音频捕获功能或 Azure Speech SDK 配置缺失，请使用Chrome浏览器并配置 Azure 密钥"
          ) : !mediaStream ? (
            <div className={styles.permissionRequest}>
              <div>未获取录屏权限，无法监听系统音频</div>
              <button
                className={styles.requestButton}
                onClick={onRequestPermission}
              >
                获取录屏权限
              </button>
            </div>
          ) : (
            "无法访问系统音频，请检查屏幕共享权限"
          )}
        </div>
      )}

      {/* 消息历史记录区域 */}
      <div className={styles.messagesContainer}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${styles.interviewerMessage}`}
            onClick={() => handleMessageClick(message.text)}
          >
            {message.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 当前识别文本显示区域 */}
      {transcript && transcript.trim() !== "" && (
        <div
          className={`${styles.transcriptDisplay} ${styles.interviewerText}`}
        >
          <div className={styles.transcriptLabel}>当前识别:</div>
          {transcript}
        </div>
      )}

      {/* 按钮区域 */}
      <div className={styles.buttonContainer}>
        {/* 添加自动提交的开关 */}
        <div className={styles.settingItem}>
          <div className={styles.settingLabel}>自动提交：</div>
          <div className={styles.settingControl}>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={isAutoSubmit}
                onChange={() => setIsAutoSubmit(!isAutoSubmit)}
              />
              <span className={styles.slider}></span>
            </label>
            <span className={styles.settingStatus}>扬声器模式可用</span>
          </div>
        </div>

        {/* 暂停恢复按钮 */}
        <button
          onClick={togglePauseCommit}
          className={`${styles.button} ${styles.pauseButton} ${
            isPaused ? styles.paused : ""
          }`}
        >
          <span>{isPaused ? "▶️ 恢复监听" : "⏸️ 暂停监听"}</span>
        </button>

        <button
          onClick={stopRecognition}
          className={`${styles.button} ${styles.stopButton}`}
        >
          <StopIcon />
          <span>结束面试</span>
        </button>

        <button
          onClick={resetTranscript}
          className={`${styles.button} ${styles.clearButton}`}
        >
          <span>🗑️ 清空</span>
        </button>
      </div>
    </>
  );
};
