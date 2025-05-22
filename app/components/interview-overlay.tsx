import React, { useState, useEffect, useRef } from "react";
import StopIcon from "../icons/pause.svg";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import "./interview-overlay.scss";
import * as tf from "@tensorflow/tfjs";
import {
  RealtimeVoiceprintRecognizer,
  VoiceRecognitionStatus,
  loadVoiceprintModelAndRecognizer,
} from "../services/voiceprint-service";
import InterviewPreparation from "./InterviewPreparation";
import { Toaster } from "react-hot-toast";

// 消息类型接口
interface Message {
  id: string;
  text: string;
  isInterviewer: boolean;
  timestamp: number;
}

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
  const [isPaused, setIsPaused] = useState(false);
  const [width, setWidth] = useState("33vw");
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(isDragging);
  const dragStartXRef = useRef(0);
  const initialWidthRef = useRef(0);

  // 添加控制面试开始的状态
  const [isStarted, setIsStarted] = useState(false);

  // 添加自动提交控制状态
  const [isAutoSubmit, setIsAutoSubmit] = useState(false);
  // 添加气泡提示显示控制
  const [showTooltip, setShowTooltip] = useState(true);

  // 声纹识别相关状态
  const [voiceprintEnabled, setVoiceprintEnabled] = useState(true);
  const [isInterviewer, setIsInterviewer] = useState(false);
  const [voiceMatchScore, setVoiceMatchScore] = useState(0);
  const [recognitionStatus, setRecognitionStatus] =
    useState<VoiceRecognitionStatus>(VoiceRecognitionStatus.IDLE);

  // 添加消息历史记录状态
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 添加语言选择状态 - 从localStorage初始化
  const [recognitionLanguage, setRecognitionLanguage] = useState<string>(
    localStorage.getItem("interviewLanguage") || "zh-CN",
  );

  // 声纹识别器引用
  const recognizerRef = useRef<RealtimeVoiceprintRecognizer | null>(null);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const voiceprintRef = useRef<Float32Array | null>(null);

  // 其他必要引用
  const lastSubmittedTextRef = useRef("");
  const isInterviewerRef = useRef(isInterviewer);
  const voiceMatchScoreRef = useRef(voiceMatchScore);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const collectedAudioDataRef = useRef<Float32Array[]>([]);
  const [isCollectingAudio, setIsCollectingAudio] = useState(false);
  const autoSubmitTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 语音识别相关
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();
  const transcriptRef = useRef(transcript);

  // 滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
    // 在消息添加后滚动到底部
    setTimeout(scrollToBottom, 100);
  };

  // 消息点击处理函数
  const handleMessageClick = (messageText: string) => {
    console.log("消息被点击:", messageText);
    submitMessage(messageText);
  };

  // 加载TensorFlow模型和声纹特征
  useEffect(() => {
    const setupVoiceprintSystem = async () => {
      try {
        // 使用提取到服务中的函数加载模型和声纹
        const result = await loadVoiceprintModelAndRecognizer(
          setRecognitionStatus,
          setVoiceprintEnabled,
          handleVoiceprintResult,
        );

        // 更新引用
        modelRef.current = result.model;
        voiceprintRef.current = result.voiceprint;
        recognizerRef.current = result.recognizer;
      } catch (error) {
        console.error("声纹系统初始化失败:", error);
        setRecognitionStatus(VoiceRecognitionStatus.ERROR);
        setVoiceprintEnabled(false);
      }
    };

    setupVoiceprintSystem();

    // 组件卸载时清理资源
    return () => {
      console.log("InterviewOverlay组件卸载，清理所有资源");

      // 停止语音识别
      try {
        SpeechRecognition.abortListening();
        SpeechRecognition.stopListening();
      } catch (e) {
        console.error("停止语音识别失败:", e);
      }

      // 停止音频采集
      stopAudioCollection();

      // 清理声纹识别器
      if (recognizerRef.current) {
        try {
          recognizerRef.current.clearBuffer();
          recognizerRef.current = null;
        } catch (e) {
          console.error("清理声纹识别器失败:", e);
        }
      }

      // 释放TensorFlow模型
      if (modelRef.current) {
        try {
          modelRef.current.dispose();
          console.log("卸载时模型已销毁");
          modelRef.current = null;
        } catch (e) {
          console.error("模型销毁出错:", e);
        }
      }

      // 最后一次确保所有音频轨道都被停止
      if (audioStreamRef.current) {
        try {
          const tracks = audioStreamRef.current.getTracks();
          tracks.forEach((track) => {
            if (track.readyState === "live") {
              track.stop();
            }
          });
          audioStreamRef.current = null;
        } catch (e) {
          console.error("停止音频轨道失败:", e);
        }
      }

      // 清除自动提交计时器
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }
    };
  }, []);

  // 处理声纹识别结果
  const handleVoiceprintResult = (result: {
    isMatch: boolean;
    score: number;
  }) => {
    setVoiceMatchScore(result.score);

    // 修改：反转逻辑，匹配成功(isMatch=true)表示是面试者，而不是面试官
    setIsInterviewer(!result.isMatch);

    // 更新引用值，确保effect外部访问最新状态
    isInterviewerRef.current = !result.isMatch; // 同样需要反转
    voiceMatchScoreRef.current = result.score;

    // 更新识别状态（保持不变，因为这只代表匹配状态，不代表身份）
    setRecognitionStatus(
      result.isMatch
        ? VoiceRecognitionStatus.MATCHED
        : VoiceRecognitionStatus.NOT_MATCHED,
    );

    // 修改日志信息，匹配成功显示为面试者
    console.log(
      `声纹识别结果: ${!result.isMatch ? "面试官" : "面试者"}, 相似度: ${(
        result.score * 100
      ).toFixed(2)}%`,
    );
  };

  // 将transcript更新到父组件
  useEffect(() => {
    transcriptRef.current = transcript;
    onTextUpdate(transcript);
  }, [transcript, onTextUpdate]);

  // 每当消息列表更新时，滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 开始音频收集并处理
  const startAudioCollection = async () => {
    if (isCollectingAudio) return;

    try {
      setIsCollectingAudio(true);
      collectedAudioDataRef.current = [];

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // 创建音频上下文
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // 创建分析器节点
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;

      // 创建音频源
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // 创建处理器节点
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      // 处理音频数据
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData);
        collectedAudioDataRef.current.push(audioData);

        // 将数据发送给实时识别器
        if (voiceprintEnabled && recognizerRef.current) {
          recognizerRef.current.addAudioData(audioData);
        }
      };

      // 连接节点
      analyser.connect(processor);
      processor.connect(audioContext.destination);
    } catch (error) {
      console.error("开始音频采集失败:", error);
      setIsCollectingAudio(false);
    }
  };

  // 停止音频采集
  const stopAudioCollection = () => {
    try {
      // 确保处理器断开连接
      if (audioProcessorRef.current && audioContextRef.current) {
        try {
          audioProcessorRef.current.disconnect();
        } catch (e) {
          console.error("断开处理器连接失败:", e);
        }
        audioProcessorRef.current = null;
      }

      // 确保音频上下文关闭
      if (audioContextRef.current) {
        try {
          // 检查音频上下文状态
          if (audioContextRef.current.state !== "closed") {
            audioContextRef.current
              .close()
              .catch((err) => console.error("关闭音频上下文失败:", err));
          }
        } catch (e) {
          console.error("音频上下文关闭异常:", e);
        }
        audioContextRef.current = null;
      }

      // 确保所有音频轨道都被停止
      if (audioStreamRef.current) {
        try {
          const tracks = audioStreamRef.current.getTracks();
          tracks.forEach((track) => {
            try {
              if (track.readyState === "live") {
                track.stop();
                console.log("成功停止音频轨道");
              }
            } catch (e) {
              console.error("停止音频轨道失败:", e);
            }
          });
          // 强制设置为null以帮助垃圾回收
          audioStreamRef.current = null;
        } catch (e) {
          console.error("停止音频流失败:", e);
        }
      }

      // 清空收集的音频数据
      collectedAudioDataRef.current = [];
      setIsCollectingAudio(false);

      // 为确保所有资源被释放，显式请求垃圾回收
      if (window.gc) {
        try {
          window.gc();
        } catch (e) {}
      }
    } catch (error) {
      console.error("停止音频采集完全失败:", error);
    }
  };

  // 当组件可见且未暂停且已开始面试时开始语音识别
  useEffect(() => {
    if (visible && !isPaused && isStarted) {
      // 从localStorage获取语言设置
      const savedLanguage =
        localStorage.getItem("interviewLanguage") || "zh-CN";

      // 配置语音识别
      SpeechRecognition.startListening({
        continuous: true,
        language: savedLanguage,
      });

      // 开始音频采集和声纹识别
      if (voiceprintEnabled) {
        startAudioCollection();
      }
    }

    return () => {
      SpeechRecognition.stopListening();
      stopAudioCollection();
    };
  }, [visible, isPaused, voiceprintEnabled, isStarted]);

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
          if (voiceprintEnabled && isInterviewerRef.current) {
            console.log("检测到面试官语音，添加到消息历史:", transcript);
            // 添加到消息历史
            addMessage(transcript, true);
            lastSubmittedTextRef.current = transcript;
            resetTranscript();
          }
          // 如果是面试者或声纹未启用
          else if (transcript !== lastSubmittedTextRef.current) {
            console.log("检测到面试者语音，添加到消息历史:", transcript);
            // 添加到消息历史
            addMessage(transcript, false);
            lastSubmittedTextRef.current = transcript;
            resetTranscript();
          }

          // submitMessage
          // 如果自动提交开启
          if (
            isAutoSubmit &&
            (isInterviewerRef.current || !voiceprintEnabled)
          ) {
            console.log("自动提交面试者语音:", transcript);
            submitMessage(transcript);
          }
        }
      }, 1800); // 1.8秒延迟，可根据需要调整
    }

    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
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

  // 开始面试的处理函数
  const startInterview = () => {
    setIsStarted(true);
    resetTranscript();
  };

  const stopRecognition = () => {
    try {
      // 先停止语音识别 - 使用更强制的方法
      SpeechRecognition.abortListening();
      setTimeout(() => {
        SpeechRecognition.stopListening();
      }, 0);

      // 确保停止所有音频采集
      stopAudioCollection();
      // 重要：确保所有的TensorFlow资源被释放
      if (recognizerRef.current) {
        recognizerRef.current.clearBuffer();
        recognizerRef.current = null;
      }

      // 确保模型正确释放，防止内存泄漏
      if (modelRef.current) {
        try {
          if (!(modelRef.current as any).__disposed) {
            modelRef.current.dispose();
            (modelRef.current as any).__disposed = true;
            console.log("模型已安全销毁");
          }
        } catch (e) {
          console.error("模型销毁出错:", e);
        }
        modelRef.current = null;
      }

      // // 提交最终结果
      // if (transcriptRef.current && transcriptRef.current.trim() !== "") {
      //   submitMessage(transcriptRef.current);
      //   // 添加到消息历史
      //   addMessage(transcriptRef.current, isInterviewerRef.current);
      // }

      // 关闭overlay
      setVisible(false);

      // 确保浏览器回收所有媒体资源
      setTimeout(() => {
        if (audioStreamRef.current) {
          const tracks = audioStreamRef.current.getTracks();
          tracks.forEach((track) => {
            if (track.readyState === "live") {
              track.stop();
              console.log("强制停止遗留音频轨道");
            }
          });
          audioStreamRef.current = null;
        }
        onClose();
      }, 100);
    } catch (error) {
      console.error("停止语音识别失败:", error);
    }
  };

  // 添加暂停/恢复功能
  const togglePauseCommit = () => {
    if (!isPaused) {
      // 使用更强制的中断方式
      SpeechRecognition.abortListening();
      // 然后再调用正常的停止方法确保完全停止
      setTimeout(() => {
        SpeechRecognition.stopListening();
      }, 0);

      // 暂停音频采集
      stopAudioCollection();

      // // 新增：检查并提交当前已识别的文字
      // if (transcriptRef.current && transcriptRef.current.trim() !== "") {
      //   console.log("暂停时提交识别内容:", transcriptRef.current);
      //   submitMessage(transcriptRef.current);
      //   // 添加到消息历史
      //   addMessage(transcriptRef.current, isInterviewerRef.current);
      //   // 提交后清空内容

      // }
      resetTranscript();
    } else {
      // 先确保停止当前可能存在的监听
      SpeechRecognition.abortListening();
      // 短暂延迟后重新启动监听
      setTimeout(() => {
        SpeechRecognition.startListening({
          continuous: true,
          language: recognitionLanguage,
        });
        // 重置文本
        resetTranscript();
      }, 0);

      // 重新开始音频采集
      if (voiceprintEnabled) {
        startAudioCollection();
      }
    }
    setIsPaused(!isPaused);
  };

  // 添加拖动相关的事件处理函数
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(() => {
      isDraggingRef.current = true;
      return true;
    });
    dragStartXRef.current = e.clientX;
    initialWidthRef.current = parseInt(width);
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartXRef.current;
      const newWidth = Math.max(
        15,
        Math.min(
          80,
          initialWidthRef.current - (deltaX / window.innerWidth) * 100,
        ),
      );
      console.log(`mouse have moved  Width:${newWidth}vw`);
      setWidth(`${newWidth}vw`);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(() => {
      isDraggingRef.current = false;
      return false;
    });
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
  };

  // 组件卸载时清理事件监听器
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);

      // 清理其他资源
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }

      stopAudioCollection();
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      className={`interview-overlay ${isDragging ? "dragging" : ""} ${
        isInterviewerRef.current && voiceprintEnabled ? "interviewer-mode" : ""
      }`}
      style={{ width }}
    >
      {/* 添加左侧拖动条 */}
      <div className="drag-handle" onMouseDown={handleDragStart} />

      <div className="content-container">
        {!isStarted ? (
          // 面试准备组件
          <InterviewPreparation
            onStart={startInterview}
            voiceprintEnabled={voiceprintEnabled}
            setVoiceprintEnabled={setVoiceprintEnabled}
          />
        ) : (
          // 已开始面试时显示面试界面
          <>
            {/* 语音识别状态指示器 */}
            <div className="status-indicator">
              <div
                className={`indicator-dot ${
                  listening ? "listening" : "not-listening"
                }`}
              />
              <span className="status-text">
                {listening ? "正在监听..." : isPaused ? "已暂停" : "未监听"}
              </span>

              {/* 添加可点击提示气泡 */}
              {showTooltip && (
                <div className="clickable-tooltip">
                  <div className="tooltip-content">单击下面的消息获取回答</div>
                  <button
                    className="tooltip-close-btn"
                    onClick={() => setShowTooltip(false)}
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 添加声纹识别状态显示 */}
              {voiceprintEnabled && (
                <div className="voiceprint-status">
                  <span
                    className={`identity-indicator ${
                      isInterviewerRef.current ? "interviewer" : "interviewee"
                    }`}
                  >
                    {isInterviewerRef.current ? "面试官" : "面试者"}
                  </span>
                  {voiceMatchScoreRef.current > 0 && (
                    <span className="match-score">
                      相似度: {(voiceMatchScoreRef.current * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 错误提示 */}
            {(!browserSupportsSpeechRecognition || !isMicrophoneAvailable) && (
              <div className="error-message">
                {!browserSupportsSpeechRecognition
                  ? "您的浏览器不支持语音识别功能,请使用Chrome浏览器"
                  : "无法访问麦克风，请检查麦克风权限"}
              </div>
            )}

            {/* 消息历史记录区域 */}
            <div className="messages-container">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${
                    message.isInterviewer
                      ? "interviewer-message"
                      : "interviewee-message"
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
                className={`transcript-display ${
                  voiceprintEnabled && isInterviewerRef.current
                    ? "interviewer-text"
                    : "interviewee-text"
                }`}
              >
                <div className="transcript-label">当前识别:</div>
                {transcript}
              </div>
            )}

            {/* 按钮区域 */}
            <div className="button-container">
              {/* 添加自动提交的开关 */}
              <div className="setting-item">
                <div className="setting-label">自动提交：</div>
                <div className="setting-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={isAutoSubmit}
                      onChange={
                        voiceprintEnabled
                          ? () => setIsAutoSubmit(!isAutoSubmit)
                          : () => {}
                      }
                    />
                    <span className="slider"></span>
                  </label>
                  <span className="setting-status">
                    {voiceprintEnabled
                      ? "可启用"
                      : "声纹未启用,请先打开声纹识别"}
                  </span>
                </div>
              </div>

              {/* 暂停恢复按钮 */}
              <button
                onClick={togglePauseCommit}
                className={`button pause-button ${isPaused ? "paused" : ""}`}
              >
                <span>{isPaused ? "▶️ 恢复监听" : "⏸️ 暂停监听"}</span>
              </button>

              <button onClick={stopRecognition} className="button stop-button">
                <StopIcon />
                <span>结束面试</span>
              </button>

              <button onClick={resetTranscript} className="button clear-button">
                <span>🗑️ 清空</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* 添加Toaster组件用于显示Toast通知 */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: "8px",
            background: "#fff",
            color: "#333",
            boxShadow: "0 3px 10px rgba(0, 0, 0, 0.1)",
          },
        }}
      />
    </div>
  );
};
