import React, { useState, useEffect, useRef } from "react";
import StopIcon from "../icons/pause.svg";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import "./interview-overlay.scss";

interface InterviewOverlayProps {
  onClose: () => void;
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
  // 添加声纹识别相关属性
  voiceprintEnabled?: boolean; // 是否启用声纹识别
  isInterviewer?: boolean; // 是否为面试官身份
  voiceMatchScore?: number; // 声纹匹配分数
  onAudioDataCollected?: (audioData: Float32Array) => void; // 收集音频数据的回调
}

export const InterviewOverlay: React.FC<InterviewOverlayProps> = ({
  onClose,
  onTextUpdate,
  submitMessage,
  voiceprintEnabled = false,
  isInterviewer = false,
  voiceMatchScore = 0,
  onAudioDataCollected,
}) => {
  const [visible, setVisible] = useState(true);

  // 添加暂停状态
  const [isPaused, setIsPaused] = useState(false);
  // 添加宽度状态和拖动状态
  const [width, setWidth] = useState("33vw");
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(isDragging);
  const dragStartXRef = useRef(0);
  const initialWidthRef = useRef(0);
  // 记录上次提交的文本，避免重复提交
  const lastSubmittedTextRef = useRef("");
  // 添加声纹识别状态
  const isInterviewerRef = useRef(isInterviewer);
  const voiceMatchScoreRef = useRef(voiceMatchScore);
  // 记录收集音频数据的计时器
  const audioCollectionTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 音频上下文和处理节点
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  // 收集的音频数据
  const collectedAudioDataRef = useRef<Float32Array[]>([]);
  // 收集状态
  const [isCollectingAudio, setIsCollectingAudio] = useState(false);
  // 自动提交计时器
  const autoSubmitTimerRef = useRef<NodeJS.Timeout | null>(null);

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
  }, [transcript, onTextUpdate]);

  // 更新声纹识别结果
  useEffect(() => {
    isInterviewerRef.current = isInterviewer;
    voiceMatchScoreRef.current = voiceMatchScore;

    // 当声纹识别状态变化时显示提示信息
    if (voiceprintEnabled) {
      console.log(
        `声纹识别状态更新: ${isInterviewer ? "面试官" : "面试者"}, 相似度: ${(
          voiceMatchScore * 100
        ).toFixed(2)}%`,
      );
    }
  }, [isInterviewer, voiceMatchScore, voiceprintEnabled]);

  // 检查浏览器是否支持语音识别
  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      console.error("您的浏览器不支持语音识别功能");
    } else if (!isMicrophoneAvailable) {
      console.error("无法访问麦克风");
    }
  }, [browserSupportsSpeechRecognition, isMicrophoneAvailable]);

  // 开始收集音频数据用于声纹识别
  const startAudioCollection = async () => {
    if (isCollectingAudio || !onAudioDataCollected) return;

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

      // 创建处理器节点
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioProcessorRef.current = processor;

      // 创建音频源
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(processor);
      processor.connect(audioContext.destination);

      // 处理音频数据
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData);
        collectedAudioDataRef.current.push(audioData);

        // 实时传递给声纹分析
        if (onAudioDataCollected) {
          onAudioDataCollected(audioData);
        }
      };

      // 设置5秒后停止采集
      audioCollectionTimerRef.current = setTimeout(() => {
        stopAudioCollection();
      }, 5000);
    } catch (error) {
      console.error("开始音频采集失败:", error);
      setIsCollectingAudio(false);
    }
  };

  // 停止音频采集
  const stopAudioCollection = () => {
    if (audioProcessorRef.current && audioContextRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current
        .close()
        .catch((err) => console.error("关闭音频上下文失败:", err));
      audioContextRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    if (audioCollectionTimerRef.current) {
      clearTimeout(audioCollectionTimerRef.current);
      audioCollectionTimerRef.current = null;
    }

    setIsCollectingAudio(false);
  };

  // 开始语音识别
  useEffect(() => {
    if (visible && !isPaused) {
      // 配置语音识别
      SpeechRecognition.startListening({
        continuous: true,
        language: "zh-CN",
      });

      // 如果启用了声纹识别，开始收集音频数据
      if (voiceprintEnabled && onAudioDataCollected) {
        startAudioCollection();
      }
    }

    return () => {
      SpeechRecognition.stopListening();
      stopAudioCollection();
    };
  }, [visible, isPaused, voiceprintEnabled, onAudioDataCollected]);

  // 添加监听transcript变化的效果，当检测到是面试官时自动提交
  useEffect(() => {
    // 清除之前的计时器
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }

    // 如果启用了声纹识别，并且被识别为面试官，且有新的文本内容
    if (
      voiceprintEnabled &&
      isInterviewerRef.current &&
      transcript &&
      transcript.trim() !== "" &&
      transcript !== lastSubmittedTextRef.current
    ) {
      // 设置一个短暂的延迟，确保收集到完整的句子
      autoSubmitTimerRef.current = setTimeout(() => {
        // 只有当transcript没有变化时才提交，避免句子还在形成过程中就提交
        if (transcript === transcriptRef.current) {
          console.log("检测到面试官语音，自动提交:", transcript);
          submitMessage(transcript);
          lastSubmittedTextRef.current = transcript;
          resetTranscript();
        }
      }, 1500); // 1.5秒延迟，可根据需要调整
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
  ]);

  const stopRecognition = () => {
    try {
      SpeechRecognition.stopListening();
      stopAudioCollection();
      // 提交最终结果
      if (transcriptRef.current) {
        submitMessage(transcriptRef.current);
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
      // 使用更强制的中断方式
      SpeechRecognition.abortListening();
      // 然后再调用正常的停止方法确保完全停止
      setTimeout(() => {
        SpeechRecognition.stopListening();
      }, 0);

      // 如果是面试官，且有内容，则提交
      if (
        voiceprintEnabled &&
        isInterviewerRef.current &&
        transcriptRef.current &&
        transcriptRef.current.trim() !== ""
      ) {
        // 使用setTimeout将提交操作放到下一个事件循环，避免阻塞UI更新
        setTimeout(() => {
          submitMessage(transcriptRef.current);
          resetTranscript();
        }, 0);
      }

      // 暂停音频采集
      stopAudioCollection();
    } else {
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
      }, 0);

      // 重新开始音频采集
      if (voiceprintEnabled && onAudioDataCollected) {
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

        {/* 识别文本显示区域 */}
        {transcript && (
          <div
            className={`transcript-display ${
              voiceprintEnabled && isInterviewerRef.current
                ? "interviewer-text"
                : ""
            }`}
          >
            {transcript}
          </div>
        )}

        {/* 按钮区域 */}
        <div className="button-container">
          {/* 暂停/恢复按钮 */}
          <button
            onClick={togglePause}
            className={`button pause-button ${isPaused ? "paused" : ""}`}
          >
            <span>{isPaused ? "▶️ 恢复监听" : "⏸️ 暂停并发送"}</span>
          </button>

          <button onClick={stopRecognition} className="button stop-button">
            <StopIcon />
            <span>结束对话</span>
          </button>

          <button onClick={resetTranscript} className="button clear-button">
            <span>🗑️ 清空</span>
          </button>
        </div>
      </div>
    </div>
  );
};
