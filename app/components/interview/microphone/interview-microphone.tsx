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
  // 从父路由获取context
  const { onClose, onTextUpdate, submitMessage } =
    useOutletContext<ChatOutletContext>();

  const [visible, setVisible] = useState(true);
  const [width, setWidth] = useState("33vw");
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(isDragging);
  const dragStartXRef = useRef(0);
  const initialWidthRef = useRef(0);

  // 添加控制面试开始的状态
  const [isStarted, setIsStarted] = useState(false);

  // 手机模式检测
  const isMobile = useIsMobile();

  // 添加手机模式下的隐藏状态控制
  const [isMinimized, setIsMinimized] = useState(false);

  // 声纹识别相关状态
  const [voiceprintEnabled, setVoiceprintEnabled] = useState(true);
  const [isInterviewer, setIsInterviewer] = useState(false);
  const [voiceMatchScore, setVoiceMatchScore] = useState(0);
  const [recognitionStatus, setRecognitionStatus] =
    useState<VoiceRecognitionStatus>(VoiceRecognitionStatus.IDLE);

  // 添加语言选择状态 - 从localStorage初始化
  const [recognitionLanguage, setRecognitionLanguage] = useState<string>(
    localStorage.getItem("interviewLanguage") || "zh-CN",
  );

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
      const newWidth = parseInt(
        Math.max(
          15,
          Math.min(
            80,
            initialWidthRef.current - (deltaX / window.innerWidth) * 100,
          ),
        ).toFixed(0),
      );
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
        className={`interview-overlay ${isDragging ? "dragging" : ""} ${
          isInterviewerRef.current && voiceprintEnabled
            ? "interviewer-mode"
            : ""
        }`}
        style={{ width: !isMobile ? width : "100%" }}
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
