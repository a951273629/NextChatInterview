import React, { useRef, useState, useEffect } from "react";
import StopIcon from "@/app/icons/pause.svg";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
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
}) => {
  // 语音识别相关
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();
  const transcriptRef = useRef(transcript);

  // 控制状态
  const [isPaused, setIsPaused] = useState(false);
  const [isAutoSubmit, setIsAutoSubmit] = useState(defaultAutoSubmit);
  const [showTooltip, setShowTooltip] = useState(true);

  // 消息相关
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSubmittedTextRef = useRef("");
  const autoSubmitTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // 消息添加函数
  const addMessage = (text: string, isInterviewer: boolean) => {
    if (!text || text.trim() === "") return;

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      text: text.trim(),
      isInterviewer,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setTimeout(scrollToBottom, 100);
  };

  // 消息点击处理函数
  const handleMessageClick = (messageText: string) => {
    console.log("消息被点击:", messageText);
    submitMessage(messageText);
  };

  // 当组件可见且未暂停时开始语音识别
  useEffect(() => {
    if (visible && !isPaused) {
      SpeechRecognition.startListening({
        continuous: true,
        language: recognitionLanguage,
      });
    }

    return () => {
      SpeechRecognition.stopListening();
    };
  }, [visible, isPaused, recognitionLanguage]);

  // 自动提交面试官语音
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
          // 如果声纹识别启用，并且被识别为面试官
          if (voiceprintEnabled && isInterviewer) {
            console.log("检测到面试官语音，添加到消息历史:", transcript);
            addMessage(transcript, true);
            lastSubmittedTextRef.current = transcript;
            resetTranscript();
          }
          // 如果是面试者或声纹未启用
          else if (transcript !== lastSubmittedTextRef.current) {
            console.log("检测到面试者语音，添加到消息历史:", transcript);
            addMessage(transcript, false);
            lastSubmittedTextRef.current = transcript;
            resetTranscript();
          }

          // 如果自动提交开启
          if (isAutoSubmit && (isInterviewer || !voiceprintEnabled)) {
            console.log("自动提交面试者语音:", transcript);
            submitMessage(transcript);
          }
        }
      }, 1800); // 1.8秒延迟
    }

    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, [
    transcript,
    voiceprintEnabled,
    isInterviewer,
    submitMessage,
    resetTranscript,
    isAutoSubmit,
  ]);

  // 暂停/恢复功能
  const togglePauseCommit = () => {
    if (!isPaused) {
      SpeechRecognition.abortListening();
      setTimeout(() => {
        SpeechRecognition.stopListening();
      }, 0);
      resetTranscript();
    } else {
      SpeechRecognition.abortListening();
      setTimeout(() => {
        SpeechRecognition.startListening({
          continuous: true,
          language: recognitionLanguage,
        });
        resetTranscript();
      }, 0);
    }
    setIsPaused(!isPaused);
  };

  // 停止识别
  const stopRecognition = () => {
    try {
      SpeechRecognition.abortListening();
      setTimeout(() => {
        SpeechRecognition.stopListening();
      }, 0);

      onStop();
    } catch (error) {
      console.error("停止语音识别失败:", error);
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
      try {
        SpeechRecognition.abortListening();
        SpeechRecognition.stopListening();
      } catch (e) {
        console.error("停止语音识别失败:", e);
      }
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
      {(!browserSupportsSpeechRecognition || !isMicrophoneAvailable) && (
        <div className={styles.errorMessage}>
          {!browserSupportsSpeechRecognition
            ? "您的浏览器不支持语音识别功能,请使用Chrome浏览器"
            : "无法访问麦克风，请检查麦克风权限"}
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
