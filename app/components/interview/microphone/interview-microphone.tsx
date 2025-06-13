import React, { useState, useEffect, useRef } from "react";
import "./interview-microphone.scss";
import * as tf from "@tensorflow/tfjs";
import {
  RealtimeVoiceprintRecognizer,
  VoiceRecognitionStatus,
  loadVoiceprintModelAndRecognizer,
} from "@/app/components/tensor-flow/services/voiceprint-service";
import InterviewPreparation from "./InterviewPreparation";
import { InterviewUnderway } from "./interview-underway-microphone";
import { Toaster } from "react-hot-toast";
import { MiniFloatWindow } from "../mini-float-window";
import { useOutletContext } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useInterviewLanguage } from "@/app/hooks/useInterviewLanguage";
import clsx from "clsx";

// 宽度管理常量
const DEFAULT_INTERVIEW_WIDTH_VW = 20;
const NARROW_INTERVIEW_WIDTH_VW = 8;
const MIN_INTERVIEW_WIDTH_VW = 10;

// 消息类型接口
interface Message {
  id: string;
  text: string;
  isInterviewer: boolean;
  timestamp: number;
}

// 定义Context类型
interface ChatOutletContext {
  onClose: () => void;
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
}

interface InterviewOverlayProps {
  onClose: () => void;
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
}

// 手机模式检测Hook
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 600px)");
    setIsMobile(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
};

export const InterviewMicrophone: React.FC = () => {
  const context = useOutletContext<ChatOutletContext>();
  const navigate = useNavigate();
  const { onClose, onTextUpdate, submitMessage } = context;

  const [visible, setVisible] = useState(true);
  const [width, setWidth] = useState(DEFAULT_INTERVIEW_WIDTH_VW);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(isDragging);
  const dragStartXRef = useRef(0);
  const initialWidthRef = useRef(0);
  const dragStartTimeRef = useRef(0);

  // 计算是否应该收缩
  const shouldNarrow = width < MIN_INTERVIEW_WIDTH_VW;

  // 添加控制面试开始的状态
  const [isStarted, setIsStarted] = useState(false);

  // 手机模式检测
  const isMobile = useIsMobile();

  // 添加手机模式下的隐藏状态控制
  const [isMinimized, setIsMinimized] = useState(false);

  // 添加消息状态管理
  const [messages, setMessages] = useState<Message[]>([]);

  // 声纹识别相关状态
  const [voiceprintEnabled, setVoiceprintEnabled] = useState(true);
  const [isInterviewer, setIsInterviewer] = useState(false);
  const [voiceMatchScore, setVoiceMatchScore] = useState(0);
  const [recognitionStatus, setRecognitionStatus] =
    useState<VoiceRecognitionStatus>(VoiceRecognitionStatus.IDLE);

  // 添加语言选择状态 - 使用新的钩子
  const [recognitionLanguage] = useInterviewLanguage();

  // 声纹识别器引用
  const recognizerRef = useRef<RealtimeVoiceprintRecognizer | null>(null);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const voiceprintRef = useRef<Float32Array | null>(null);

  // 其他必要引用
  const isInterviewerRef = useRef(isInterviewer);
  const voiceMatchScoreRef = useRef(voiceMatchScore);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const collectedAudioDataRef = useRef<Float32Array[]>([]);
  const [isCollectingAudio, setIsCollectingAudio] = useState(false);

  // 显示悬浮窗的处理函数
  const handleShowFromFloat = () => {
    setIsMinimized(false);
  };

  // 添加最小化处理函数
  const handleMinimize = () => {
    if (isMobile) {
      setIsMinimized(true);
    }
  };

  // 添加消息处理函数
  const handleAddMessage = (text: string, isInterviewer: boolean) => {
    if (!text || text.trim() === "") return;

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      text: text.trim(),
      isInterviewer,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMessage]);
  };

  // 加载TensorFlow模型和声纹特征
  useEffect(() => {
    const setupVoiceprintSystem = async () => {
      try {
        const result = await loadVoiceprintModelAndRecognizer(
          setRecognitionStatus,
          setVoiceprintEnabled,
          handleVoiceprintResult,
        );

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

    return () => {
      console.log("InterviewOverlay组件卸载，清理所有资源");

      stopAudioCollection();

      if (recognizerRef.current) {
        try {
          recognizerRef.current.clearBuffer();
          recognizerRef.current = null;
        } catch (e) {
          console.error("清理声纹识别器失败:", e);
        }
      }

      if (modelRef.current) {
        try {
          modelRef.current.dispose();
          console.log("卸载时模型已销毁");
          modelRef.current = null;
        } catch (e) {
          console.error("模型销毁出错:", e);
        }
      }

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
    };
  }, []);

  // 处理声纹识别结果
  const handleVoiceprintResult = (result: {
    isMatch: boolean;
    score: number;
  }) => {
    setVoiceMatchScore(result.score);
    setIsInterviewer(!result.isMatch);

    isInterviewerRef.current = !result.isMatch;
    voiceMatchScoreRef.current = result.score;

    setRecognitionStatus(
      result.isMatch
        ? VoiceRecognitionStatus.MATCHED
        : VoiceRecognitionStatus.NOT_MATCHED,
    );

    console.log(
      `声纹识别结果: ${!result.isMatch ? "面试官" : "面试者"}, 相似度: ${(
        result.score * 100
      ).toFixed(2)}%`,
    );
  };

  // 开始音频收集并处理
  const startAudioCollection = async () => {
    if (isCollectingAudio) return;

    try {
      setIsCollectingAudio(true);
      collectedAudioDataRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData);
        collectedAudioDataRef.current.push(audioData);

        if (voiceprintEnabled && recognizerRef.current) {
          recognizerRef.current.addAudioData(audioData);
        }
      };

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
      if (audioProcessorRef.current && audioContextRef.current) {
        try {
          audioProcessorRef.current.disconnect();
        } catch (e) {
          console.error("断开处理器连接失败:", e);
        }
        audioProcessorRef.current = null;
      }

      if (audioContextRef.current) {
        try {
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
          audioStreamRef.current = null;
        } catch (e) {
          console.error("停止音频流失败:", e);
        }
      }

      collectedAudioDataRef.current = [];
      setIsCollectingAudio(false);

      if (window.gc) {
        try {
          window.gc();
        } catch (e) {}
      }
    } catch (error) {
      console.error("停止音频采集完全失败:", error);
    }
  };

  // 当组件可见且已开始面试时开始音频采集
  useEffect(() => {
    if (visible && isStarted && voiceprintEnabled) {
      startAudioCollection();
    }

    return () => {
      stopAudioCollection();
    };
  }, [visible, voiceprintEnabled, isStarted]);

  // 开始面试的处理函数
  const startInterview = () => {
    setIsStarted(true);
  };

  // 停止面试的处理函数
  const handleStopInterview = () => {
    try {
      stopAudioCollection();

      if (recognizerRef.current) {
        recognizerRef.current.clearBuffer();
        recognizerRef.current = null;
      }

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

      setVisible(false);

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
      console.error("停止面试失败:", error);
    }
  };

  // 切换宽度的函数
  const toggleWidth = () => {
    setWidth((prevWidth) => {
      if (prevWidth < MIN_INTERVIEW_WIDTH_VW) {
        return DEFAULT_INTERVIEW_WIDTH_VW;
      } else {
        return NARROW_INTERVIEW_WIDTH_VW;
      }
    });
  };

  // 添加拖动相关的事件处理函数
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(() => {
      isDraggingRef.current = true;
      return true;
    });
    dragStartXRef.current = e.clientX;
    initialWidthRef.current = width;
    dragStartTimeRef.current = Date.now();
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (isDraggingRef.current) {
      const deltaX = e.clientX - dragStartXRef.current;
      const newWidth = Math.max(
        NARROW_INTERVIEW_WIDTH_VW,
        Math.min(
          80,
          initialWidthRef.current - (deltaX / window.innerWidth) * 100,
        ),
      );
      
      // 当宽度小于最小值时，吸附到收缩宽度
      if (newWidth < MIN_INTERVIEW_WIDTH_VW) {
        setWidth(NARROW_INTERVIEW_WIDTH_VW);
      } else {
        setWidth(newWidth);
      }
    }
  };

  const handleDragEnd = () => {
    setIsDragging(() => {
      isDraggingRef.current = false;
      return false;
    });
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    
    // 如果用户点击拖拽手柄，应该切换宽度
    const shouldFireClick = Date.now() - dragStartTimeRef.current < 300;
    if (shouldFireClick) {
      toggleWidth();
    }
  };

  // 组件卸载时清理事件监听器
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
      stopAudioCollection();
    };
  }, []);

  if (!visible) {
    return null;
  }

  // 在手机模式下，如果最小化了，只显示悬浮窗
  if (isMobile && isMinimized) {
    return <MiniFloatWindow isVisible={true} onShow={handleShowFromFloat} />;
  }

  return (
    <>
      <div
        className={clsx(
          "interview-overlay",
          isDragging ? "dragging" : "",
          isInterviewerRef.current && voiceprintEnabled ? "interviewer-mode" : "",
          shouldNarrow ? "narrow-mode" : ""
        )}
        style={{ width: isMobile ? "100vw" : `${width}vw` }}
      >
        <div className="drag-handle" onMouseDown={handleDragStart} />

        <div className="content-container">
          <button className="close-button" onClick={onClose}>
            ×
          </button>

          {!isStarted ? (
            <InterviewPreparation
              onStart={startInterview}
              voiceprintEnabled={voiceprintEnabled}
              setVoiceprintEnabled={setVoiceprintEnabled}
            />
          ) : (
            <InterviewUnderway
              visible={visible}
              voiceprintEnabled={voiceprintEnabled}
              recognitionLanguage={recognitionLanguage}
              isInterviewer={isInterviewerRef.current}
              voiceMatchScore={voiceMatchScoreRef.current}
              onTextUpdate={onTextUpdate}
              submitMessage={submitMessage}
              onStop={handleStopInterview}
              onMinimize={handleMinimize}
              isMobile={isMobile}
              messages={messages}
              onAddMessage={handleAddMessage}
            />
          )}
        </div>

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

      {!isMobile && (
        <MiniFloatWindow isVisible={false} onShow={handleShowFromFloat} />
      )}
    </>
  );
};
