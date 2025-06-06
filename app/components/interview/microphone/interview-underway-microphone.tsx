import React, { useRef, useState, useEffect } from "react";
import StopIcon from "@/app/icons/pause.svg";
import { 
  AzureSpeechRecognizer, 
  getAzureSpeechConfig, 
  isAzureSpeechAvailable 
} from "../azureSpeech";
import styles from "./interview-underway-microphone.module.scss";

// 消息类型接口
interface Message {
  id: string;
  text: string;
  isInterviewer: boolean;
  timestamp: number;
}

interface InterviewUnderwayProps {
  // 控制状态
  visible: boolean;
  voiceprintEnabled: boolean;
  recognitionLanguage: string;

  // 声纹识别相关
  isInterviewer: boolean;
  voiceMatchScore: number;

  // 回调函数
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
  onStop: () => void;

  // 可选：默认自动提交状态（扬声器模式下默认开启）
  defaultAutoSubmit?: boolean;

  // 移动端相关
  onMinimize?: () => void;
  isMobile?: boolean;

  // 消息管理
  messages?: Message[];
  onAddMessage?: (text: string, isInterviewer: boolean) => void;
}

export const InterviewUnderway: React.FC<InterviewUnderwayProps> = ({
  visible,
  voiceprintEnabled,
  recognitionLanguage,
  isInterviewer,
  voiceMatchScore,
  onTextUpdate,
  submitMessage,
  onStop,
  defaultAutoSubmit = false,
  onMinimize,
  isMobile = false,
  messages = [],
  onAddMessage,
}) => {
  // Azure Speech 相关状态
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [recognizer, setRecognizer] = useState<AzureSpeechRecognizer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [microphoneAvailable, setMicrophoneAvailable] = useState(false);
  const [azureSpeechAvailable, setAzureSpeechAvailable] = useState(false);

  // 引用变量
  const transcriptRef = useRef(transcript);
  const recognizerRef = useRef<AzureSpeechRecognizer | null>(null);

  // 控制状态
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoSubmit, setIsAutoSubmit] = useState(defaultAutoSubmit);
  const [showTooltip, setShowTooltip] = useState(true);

  // 消息相关 - 移除内部状态，使用外部传入的
  // const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSubmittedTextRef = useRef("");

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

  // 消息添加函数 - 使用外部传入的回调
  // const addMessage = (text: string, isInterviewer: boolean) => {
  //   if (onAddMessage) {
  //     onAddMessage(text, isInterviewer);
  //   }
  // };

  // 消息点击处理函数
  const handleMessageClick = (messageText: string) => {
    console.log("消息被点击:", messageText);
    submitMessage(messageText);
    
    // 在移动端模式下，点击消息后最小化页面
    if (isMobile && onMinimize) {
      onMinimize();
    }
  };

  // 检查 Azure Speech 可用性
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const available = isAzureSpeechAvailable();
        setAzureSpeechAvailable(available);
        console.log("🔍 Azure Speech 可用性检查:", available);
      } catch (error) {
        console.error("❌ Azure Speech 可用性检查失败:", error);
        setError("Azure Speech 服务不可用，请检查配置");
        setAzureSpeechAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  // 请求麦克风权限
  const requestMicrophonePermission = async (): Promise<MediaStream | null> => {
    try {
      console.log("🎤 请求麦克风权限...");
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("浏览器不支持麦克风访问");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      });

      console.log("✅ 麦克风权限获取成功");
      setMicrophoneAvailable(true);
      setError(null);
      return stream;
    } catch (error) {
      console.error("❌ 麦克风权限获取失败:", error);
      setMicrophoneAvailable(false);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setError("麦克风权限被拒绝，请允许麦克风访问");
        } else if (error.name === 'NotFoundError') {
          setError("未找到麦克风设备");
        } else {
          setError(`麦克风访问失败: ${error.message}`);
        }
      } else {
        setError("麦克风访问失败");
      }
      return null;
    }
  };

  // 初始化 Azure Speech 识别器
  const initializeRecognizer = async (): Promise<AzureSpeechRecognizer | null> => {
    try {
      console.log("🚀 初始化 Azure Speech 识别器...");
      
      if (!azureSpeechAvailable) {
        throw new Error("Azure Speech 服务不可用");
      }

      // 获取配置
      const config = getAzureSpeechConfig();
      config.language = recognitionLanguage || "zh-CN";

      // 创建识别器
      const newRecognizer = new AzureSpeechRecognizer(config);

      // 获取麦克风流
      const stream = await requestMicrophonePermission();
      if (!stream) {
        throw new Error("无法获取麦克风音频流");
      }

      // 设置音频配置
      newRecognizer.createAudioConfigFromStream(stream);

      setMediaStream(stream);
      setRecognizer(newRecognizer);
      recognizerRef.current = newRecognizer;

      console.log("✅ Azure Speech 识别器初始化成功");
      return newRecognizer;
    } catch (error) {
      console.error("❌ 初始化 Azure Speech 识别器失败:", error);
      setError(typeof error === "string" ? error : (error as Error).message);
      return null;
    }
  };

  // 处理识别结果
  const handleRecognitionResult = (text: string, isFinal: boolean) => {
    console.log(`🔄 识别结果 (${isFinal ? '最终' : '临时'}):`, text);
    
    // 总是更新当前显示的文本
    setTranscript(text);
    transcriptRef.current = text;
    onTextUpdate(text);
    
    // 只有最终结果才触发自动提交相关逻辑，不需要延迟
    if (isFinal && text && text.trim() !== "") {
      console.log("🎯 最终识别结果，立即处理自动提交逻辑:", text);
      
      // 直接处理自动提交逻辑，不需要延迟
      // 如果声纹识别启用，并且被识别为面试官
      if (voiceprintEnabled && isInterviewer) {
        console.log("检测到面试官语音，添加到消息历史:", text);
        onAddMessage?.(text, true);
        lastSubmittedTextRef.current = text;
        // 重置文本
        setTranscript("");
        transcriptRef.current = "";
        onTextUpdate("");
      }
      // 如果是面试者或声纹未启用
      else if (text !== lastSubmittedTextRef.current) {
        console.log("检测到面试者语音，添加到消息历史:", text);
        onAddMessage?.(text, false);
        lastSubmittedTextRef.current = text;
        // 重置文本
        setTranscript("");
        transcriptRef.current = "";
        onTextUpdate("");
      }

      // 如果自动提交开启
      if (isAutoSubmit && (isInterviewer || !voiceprintEnabled)) {
        console.log("自动提交面试者语音:", text);
        submitMessage(text);
      }
    }
  };

  // 处理识别错误
  const handleRecognitionError = (errorMessage: string) => {
    console.error("❌ 语音识别错误:", errorMessage);
    setError(errorMessage);
    setListening(false);
  };

  // 处理识别结束
  const handleRecognitionEnd = () => {
    console.log("🏁 语音识别结束");
    setListening(false);
  };

  // 开始语音识别
  const startListening = async () => {
    try {
      console.log("▶️ 开始语音识别...");
      
      let currentRecognizer = recognizerRef.current;
      
      if (!currentRecognizer) {
        currentRecognizer = await initializeRecognizer();
        if (!currentRecognizer) {
          throw new Error("识别器初始化失败");
        }
      }

      // 开始连续识别
      currentRecognizer.startContinuousRecognition(
        handleRecognitionResult,
        handleRecognitionError,
        handleRecognitionEnd
      );

      setListening(true);
      setError(null);
      
      console.log("✅ 语音识别已启动");
    } catch (error) {
      console.error("❌ 启动语音识别失败:", error);
      setError(typeof error === "string" ? error : (error as Error).message);
      setListening(false);
    }
  };

  // 停止语音识别
  const stopListening = () => {
    console.log("⏹️ 停止语音识别...");
    
    if (recognizerRef.current) {
      recognizerRef.current.stopRecognition();
    }
    
    setListening(false);
  };

  // 重置识别文本
  const resetTranscript = () => {
    console.log("🗑️ 重置识别文本");
    setTranscript("");
    transcriptRef.current = "";
    onTextUpdate("");
  };

  // 清理资源
  const cleanup = () => {
    console.log("🧹 清理 Azure Speech 资源...");
    
    // 停止识别
    if (recognizerRef.current) {
      recognizerRef.current.dispose();
      recognizerRef.current = null;
    }

    // 关闭媒体流
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => {
        track.stop();
        console.log("🔇 音频轨道已停止:", track.label);
      });
      setMediaStream(null);
    }

    setRecognizer(null);
    setListening(false);
    setError(null);
  };

  // 当组件可见且未暂停时开始语音识别
  useEffect(() => {
    if (visible && !isPaused && azureSpeechAvailable) {
      startListening();
    } else if (!visible || isPaused) {
      stopListening();
    }

    return () => {
      if (!visible) {
        cleanup();
      }
    };
  }, [visible, isPaused, azureSpeechAvailable, recognitionLanguage]);

  // 暂停/恢复功能
  const togglePauseCommit = () => {
    if (!isPaused) {
      stopListening();
      resetTranscript();
    } else if (azureSpeechAvailable) {
      startListening();
    }
    setIsPaused(!isPaused);
  };

  // 停止识别
  const stopRecognition = () => {
    try {
      cleanup();
      onStop();
    } catch (error) {
      console.error("停止语音识别失败:", error);
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清理 Azure Speech 资源
      cleanup();
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
          {listening ? "正在监听..." : isPaused ? "已暂停" : "未监听"}
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

        {/* 添加声纹识别状态显示 */}
        {voiceprintEnabled && (
          <div className={styles.voiceprintStatus}>
            <span
              className={`${styles.identityIndicator} ${
                isInterviewer ? styles.interviewer : styles.interviewee
              }`}
            >
              {isInterviewer ? "面试官" : "面试者"}
            </span>
            {voiceMatchScore > 0 && (
              <span className={styles.matchScore}>
                相似度: {(voiceMatchScore * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {(!azureSpeechAvailable || !microphoneAvailable || error) && (
        <div className={styles.errorMessage}>
          {!azureSpeechAvailable
            ? "Azure Speech 服务不可用，请检查配置"
            : !microphoneAvailable
            ? "无法访问麦克风，请检查麦克风权限"
            : error}
        </div>
      )}

      {/* 消息历史记录区域 */}
      <div className={styles.messagesContainer}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${
              message.isInterviewer
                ? styles.interviewerMessage
                : styles.intervieweeMessage
            }`}
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
          className={`${styles.transcriptDisplay} ${
            voiceprintEnabled && isInterviewer
              ? styles.interviewerText
              : styles.intervieweeText
          }`}
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
                onChange={
                  voiceprintEnabled
                    ? () => setIsAutoSubmit(!isAutoSubmit)
                    : () => {}
                }
              />
              <span className={styles.slider}></span>
            </label>
            <span className={styles.settingStatus}>
              {voiceprintEnabled ? "可启用" : "声纹未启用,请先打开声纹识别"}
            </span>
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
