import React, { useState, useEffect, useRef } from "react";
import "./interview-microphone.scss";
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
const NARROW_INTERVIEW_WIDTH_VW = 10;
const MIN_INTERVIEW_WIDTH_VW = 12;

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

  // 添加语言选择状态 - 使用新的钩子
  const [recognitionLanguage] = useInterviewLanguage();

  // 添加麦克风设备选择状态管理
  const [selectedMicId, setSelectedMicId] = useState<string>("");

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

  // 开始面试的处理函数
  const startInterview = () => {
    setIsStarted(true);
  };

  // 停止面试的处理函数
  const handleStopInterview = () => {
    try {
      setVisible(false);

      setTimeout(() => {
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
              shouldNarrow={shouldNarrow}
              selectedMicId={selectedMicId}
              onMicChange={setSelectedMicId}
            />
          ) : (
            <InterviewUnderway
              shouldNarrow={shouldNarrow}
              visible={visible}
              recognitionLanguage={recognitionLanguage}
              selectedMicId={selectedMicId}
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
