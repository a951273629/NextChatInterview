import React, { useState, useEffect, useRef } from "react";
import StopIcon from "../icons/pause.svg";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";

interface InterviewOverlayProps {
  onClose: () => void;
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
}

export const InterviewOverlay: React.FC<InterviewOverlayProps> = ({
  onClose,
  onTextUpdate,
  submitMessage,
}) => {
  const [visible, setVisible] = useState(true);
  const [countdown, setCountdown] = useState(20);
  const countdownRef = useRef(countdown);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  // 添加暂停状态
  const [isPaused, setIsPaused] = useState(false);

  // 使用 react-speech-recognition 的钩子
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();

  // 保存当前文本的引用，用于在倒计时结束时提交
  const transcriptRef = useRef(transcript);

  useEffect(() => {
    transcriptRef.current = transcript;
    onTextUpdate(transcript);

    // 当有新的语音识别结果时，重置倒计时
    if (transcript) {
      setCountdown(20);
      countdownRef.current = 20;
    }
  }, [transcript, onTextUpdate]);

  // 检查浏览器是否支持语音识别
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      console.error("您的浏览器不支持语音识别功能");
    } else if (!isMicrophoneAvailable) {
      console.error("无法访问麦克风");
    }
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable]);

  // 开始语音识别
  useEffect(() => {
    if (visible && !isPaused) {
      // 配置语音识别
      SpeechRecognition.startListening({
        continuous: true,
        language: "zh-CN",
      });

      // 设置倒计时
      intervalIdRef.current = setInterval(() => {
        setCountdown((prev) => {
          const newCount = prev - 1;
          countdownRef.current = newCount;

          if (newCount <= 0) {
            stopRecognition();
          }
          return newCount;
        });
      }, 1000);
    }

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }
      SpeechRecognition.stopListening();
    };
  }, [visible, isPaused]);

  const stopRecognition = () => {
    try {
      SpeechRecognition.stopListening();

      // 提交最终结果
      if (transcriptRef.current) {
        submitMessage(transcriptRef.current);
      }

      // 清理倒计时
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }

      // 关闭overlay
      setVisible(false);
      onClose();
    } catch (error) {
      console.error("停止语音识别失败:", error);
    }
  };

  // 添加暂停/恢复功能
  const togglePause = () => {
    if (!isPaused) {
      // 暂停
      SpeechRecognition.stopListening();
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }

      // 提交当前文本
      if (transcriptRef.current) {
        submitMessage(transcriptRef.current);
        resetTranscript();
      }
    } else {
      // 恢复
      console.log("recover ");

      // 先确保停止当前可能存在的监听
      SpeechRecognition.abortListening();

      // 短暂延迟后重新启动监听
      setTimeout(() => {
        SpeechRecognition.startListening({
          continuous: true,
          language: "zh-CN",
        });

        // 重置文本
        resetTranscript();
      }, 100);
      // 重新设置倒计时
      intervalIdRef.current = setInterval(() => {
        setCountdown((prev) => {
          const newCount = prev - 1;
          countdownRef.current = newCount;

          if (newCount <= 0) {
            stopRecognition();
          }
          return newCount;
        });
      }, 1000);
    }

    setIsPaused(!isPaused);
  };

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        width: "33vw",
        height: "100vh",
        // maxHeight: "80vh",
        backgroundColor: "#1e1e1e", // 替换 var(--gray)
        border: "1px solid rgba(255, 255, 255, 0.2)", // 替换 var(--border-in-light)
        borderRadius: "10px",
        boxShadow: "0 5px 20px rgba(0, 0, 0, 0.3)", // 替换 var(--shadow)
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        color: "#ffffff", // 替换 C 为白色
        zIndex: 1000,
        padding: "20px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: "500",
            marginBottom: "1rem",
            textAlign: "left",
            color: "#ffffff", // 替换 var(--white)
          }}
        >
          剩余{" "}
          <span
            style={{
              color: countdown <= 5 ? "#ff6b6b" : "#4caf50",
              fontWeight: "bold",
            }}
          >
            {countdown}
          </span>{" "}
          秒，超时将自动发送
        </h2>

        {/* 语音识别状态指示器 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            marginBottom: "1rem",
            backgroundColor: "rgba(0, 0, 0, 0.5)", // 替换 var(--black-50)
            padding: "0.5rem 1rem",
            borderRadius: "1rem",
            width: "fit-content",
          }}
        >
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: listening ? "#4caf50" : "#ff6b6b",
              marginRight: "10px",
              boxShadow: listening ? "0 0 10px #4caf50" : "none",
              animation: listening ? "pulse 1.5s infinite" : "none",
            }}
          />
          <span style={{ fontSize: "0.9rem" }}>
            {listening ? "正在监听..." : isPaused ? "已暂停" : "未监听"}
          </span>
        </div>

        {/* 错误提示 */}
        {(!browserSupportsSpeechRecognition || !isMicrophoneAvailable) && (
          <div
            style={{
              color: "#ff6b6b",
              marginBottom: "1rem",
              backgroundColor: "rgba(0, 0, 0, 0.5)", // 替换 var(--black-50)
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              width: "100%",
              textAlign: "center",
            }}
          >
            {!browserSupportsSpeechRecognition
              ? "您的浏览器不支持语音识别功能,请使用Chrome浏览器"
              : "无法访问麦克风，请检查麦克风权限"}
          </div>
        )}

        {/* 识别文本显示区域 */}
        {transcript && (
          <div
            style={{
              width: "100%",
              marginBottom: "1rem",
              padding: "1rem",
              backgroundColor: "rgba(0, 0, 0, 0.5)", // 替换 var(--black-50)
              borderRadius: "0.5rem",
              maxHeight: "120px",
              overflowY: "auto",
              textAlign: "left",
              fontSize: "0.9rem",
              lineHeight: "1.5",
              border: "1px solid rgba(0, 0, 0, 0.5)", // 替换 var(--black-50)
            }}
          >
            {transcript}
          </div>
        )}

        {/* 按钮区域 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.5rem",
            marginTop: "1rem",
            width: "100%",
          }}
        >
          {/* 暂停/恢复按钮 */}
          <button
            onClick={togglePause}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              backgroundColor: isPaused ? "#4caf50" : "#ff9800",
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.9rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
              flex: "1",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = isPaused
                ? "#45a049"
                : "#f57c00")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = isPaused
                ? "#4caf50"
                : "#ff9800")
            }
          >
            <span>{isPaused ? "▶️ 恢复监听" : "⏸️ 暂停并发送"}</span>
          </button>

          <button
            onClick={stopRecognition}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              backgroundColor: "rgba(0, 0, 0, 0.5)", // 替换 var(--black-50)
              color: "white",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.9rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
              flex: "1",
            }}
            onMouseOver={
              (e) => (e.currentTarget.style.backgroundColor = "#000000") // 替换 var(--black)
            }
            onMouseOut={
              (e) =>
                (e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.5)") // 替换 var(--black-50)
            }
          >
            <StopIcon />
            <span>停止并发送</span>
          </button>

          <button
            onClick={resetTranscript}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              backgroundColor: "transparent",
              color: "white",
              border: "1px solid rgba(0, 0, 0, 0.5)", // 替换 var(--black-50)
              borderRadius: "0.5rem",
              padding: "0.5rem 1rem",
              fontSize: "0.9rem",
              cursor: "pointer",
              transition: "all 0.2s ease",
              flex: "1",
            }}
            onMouseOver={
              (e) =>
                (e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.5)") // 替换 var(--black-50)
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            <span>🗑️ 清空</span>
          </button>
        </div>
      </div>

      {/* 添加脉冲动画 */}
      <style>
        {`
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
            100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
          }
        `}
      </style>
    </div>
  );
};
