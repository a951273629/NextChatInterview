import React from "react";
import { SyncMode, ACTIVATION_KEY_STRING } from "@/app/types/websocket-sync";
import { toast } from "react-hot-toast";
import { RecognitionLanguage } from "@/app/hooks/useInterviewLanguage";
import { USER_RESUMES_STORAGE_KEY, USER_RESUMES_NAME_STORAGE_KEY } from "@/app/constant";

// 类型定义
export type DeviceStatus = "ready" | "error" | "unavailable" | "unauthorized";
export type NetworkStatus = "good" | "average" | "poor";
export type ScreenCaptureStatus = "pending" | "granted" | "denied" | "unavailable";

export interface SpeakerDevice {
  deviceId: string;
  label: string;
}

// 消息接口
export interface Message {
  id: string;
  text: string;
  isInterviewer: boolean;
  timestamp: number;
}

export interface StatusInfo {
  text: string;
  color: string;
  progress: number;
}

// 常量定义
const MIN_INTERVIEW_WIDTH_VW = 14;
const NARROW_INTERVIEW_WIDTH_VW = 10;

// 服务类接口
export interface LoudspeakerServiceCallbacks {
  setSpeakerStatus: (status: DeviceStatus) => void;
  setSpeakerDevices: (devices: SpeakerDevice[]) => void;
  setSelectedSpeakerId: (id: string) => void;
  setShowSpeakerDropdown: (show: boolean) => void;
  setNetworkStatus: (status: NetworkStatus) => void;
  setScreenCaptureStatus: (status: ScreenCaptureStatus) => void;
  setHasScreenPermission: (has: boolean) => void;
  setRetryCount: (count: number) => void;
  setIsDragging: (dragging: boolean) => void;
  setWidth: (width: number) => void;
  toggleWidth: () => void;
  // 新增：消息和UI控制回调
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setIsMinimized: (minimized: boolean) => void;
  setIsStarted: (started: boolean) => void;
  setRecognitionLanguage: (language: RecognitionLanguage) => void;
  setActivationKey: (key: string) => void;
}

export interface LoudspeakerServiceRefs {
  audioElementRef: React.MutableRefObject<HTMLAudioElement | null>;
  testAudioContextRef: React.MutableRefObject<AudioContext | null>;
  mediaStreamRef: React.MutableRefObject<MediaStream | null>;
  isDraggingRef: React.MutableRefObject<boolean>;
  dragStartXRef: React.MutableRefObject<number>;
  initialWidthRef: React.MutableRefObject<number>;
  dragStartTimeRef: React.MutableRefObject<number>;
}

export interface LoudspeakerServiceProps {
  callbacks: LoudspeakerServiceCallbacks;
  refs: LoudspeakerServiceRefs;
  retryCount: number;
  maxRetries: number;
  isMobile: boolean;
  width: number;
  // 新增：WebSocket和同步相关
  webSocketSync?: any;
  syncMode?: SyncMode;
  activationKey?: string;
}

export class LoudspeakerService {
  private callbacks: LoudspeakerServiceCallbacks;
  private refs: LoudspeakerServiceRefs;
  private retryCount: number;
  private maxRetries: number;
  private isMobile: boolean;
  private width: number;
  private webSocketSync?: any;
  private syncMode?: SyncMode;
  private activationKey?: string;

  constructor(props: LoudspeakerServiceProps) {
    this.callbacks = props.callbacks;
    this.refs = props.refs;
    this.retryCount = props.retryCount;
    this.maxRetries = props.maxRetries;
    this.isMobile = props.isMobile;
    this.width = props.width;
    this.webSocketSync = props.webSocketSync;
    this.syncMode = props.syncMode;
    this.activationKey = props.activationKey;
  }

  // 更新服务状态
  updateProps(props: Partial<LoudspeakerServiceProps>) {
    if (props.retryCount !== undefined) this.retryCount = props.retryCount;
    if (props.isMobile !== undefined) this.isMobile = props.isMobile;
    if (props.width !== undefined) this.width = props.width;
    if (props.webSocketSync !== undefined) this.webSocketSync = props.webSocketSync;
    if (props.syncMode !== undefined) this.syncMode = props.syncMode;
    if (props.activationKey !== undefined) this.activationKey = props.activationKey;
  }

  // 检查扬声器状态
  async checkSpeakerStatus(): Promise<void> {
    try {
      // 获取音频输出设备列表
      await this.getAudioOutputDevices();

      // 创建测试音频元素
      const audio = new Audio();
      this.refs.audioElementRef.current = audio;

      // 创建一个短暂的静音音频进行测试
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.refs.testAudioContextRef.current = audioContext;

      // 创建一个1秒的静音缓冲区用于测试
      const buffer = audioContext.createBuffer(
        1,
        audioContext.sampleRate * 0.1,
        audioContext.sampleRate,
      );
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);

      // 播放测试音频
      source.start();

      this.callbacks.setSpeakerStatus("ready");
      console.log("扬声器检查通过");
    } catch (error: any) {
      console.error("扬声器检测失败:", error);
      this.callbacks.setSpeakerStatus("error");
    }
  }

  // 获取音频输出设备列表
  async getAudioOutputDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices
        .filter((device) => device.kind === "audiooutput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `扬声器 ${device.deviceId.slice(0, 5)}`,
        }));

      // 添加默认设备选项
      const defaultDevice: SpeakerDevice = {
        deviceId: "system-default",
        label: "默认扬声器",
      };

      this.callbacks.setSpeakerDevices([defaultDevice, ...audioOutputs]);
      console.log("找到扬声器设备:", audioOutputs.length + 1);
    } catch (error) {
      console.error("获取扬声器设备失败:", error);
      // 如果获取失败，至少提供默认选项
      this.callbacks.setSpeakerDevices([{ deviceId: "system-default", label: "默认扬声器" }]);
    }
  }

  // 选择扬声器设备
  async selectSpeakerDevice(deviceId: string): Promise<void> {
    try {
      this.callbacks.setSelectedSpeakerId(deviceId);
      this.callbacks.setShowSpeakerDropdown(false);

      // 如果有音频元素，尝试设置输出设备
      if (this.refs.audioElementRef.current && 'setSinkId' in this.refs.audioElementRef.current) {
        await (this.refs.audioElementRef.current as any).setSinkId(
          deviceId === "system-default" ? "" : deviceId,
        );
        console.log("已切换到扬声器:", deviceId);
      }
    } catch (error) {
      console.error("切换扬声器设备失败:", error);
    }
  }

  // 检测网络状态
  checkNetworkStatus(): void {
    const connection = (navigator as any).connection;
    if (connection) {
      const speed = connection.downlink;
      if (speed >= 10) {
        this.callbacks.setNetworkStatus("good");
      } else if (speed >= 1.5) {
        this.callbacks.setNetworkStatus("average");
      } else {
        this.callbacks.setNetworkStatus("poor");
      }
    } else {
      this.callbacks.setNetworkStatus("good");
    }
  }

  // 获取录屏权限
  async requestScreenCapture(): Promise<void> {
    try {
      this.callbacks.setScreenCaptureStatus("pending");
      console.log("开始请求录屏权限...");

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      this.refs.mediaStreamRef.current = stream;

      this.callbacks.setScreenCaptureStatus("granted");
      this.callbacks.setHasScreenPermission(true);
      console.log("录屏权限获取成功");

      // 重置重试计数（成功获取权限时）
      this.callbacks.setRetryCount(0);

      // 简化的音频轨道事件监听
      stream.getAudioTracks().forEach((track, index) => {
        console.log(`🎵 监听音频轨道 ${index}: ${track.label}`);
        
        track.onended = () => {
          console.log(`🔇 音频轨道已结束: ${track.label}`);
          
          // 自动重试逻辑
          if (this.retryCount < this.maxRetries) {
            const currentRetry = this.retryCount + 1;
            this.callbacks.setRetryCount(currentRetry);
            console.log(`🔄 自动重试获取屏幕共享权限 (${currentRetry}/${this.maxRetries})...`);
            
            // 延迟1秒后重试
            setTimeout(() => {
              this.requestScreenCapture().catch((error) => {
                console.error(`❌ 重试 ${currentRetry} 失败:`, error);
              });
            }, 1000);
          } else {
            console.log("❌ 已达到最大重试次数，停止屏幕共享");
            this.stopScreenCapture();
          }
        };
      });

    } catch (error: any) {
      console.error("获取录屏权限失败:", error);
      this.callbacks.setScreenCaptureStatus("denied");
      this.callbacks.setHasScreenPermission(false);

      if (error.name === "NotAllowedError") {
        alert("需要允许屏幕共享权限以捕获系统音频。请重新尝试并允许权限。");
      } else if (error.name === "NotSupportedError") {
        alert("您的浏览器不支持系统音频捕获功能。");
        this.callbacks.setScreenCaptureStatus("unavailable");
      } else {
        alert("无法访问系统音频，请检查权限设置。");
      }
      
      throw error;
    }
  }

  // 停止录屏捕获
  stopScreenCapture(): void {
    try {
      // 停止媒体流
      if (this.refs.mediaStreamRef.current) {
        this.refs.mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        this.refs.mediaStreamRef.current = null;
      }

      this.callbacks.setHasScreenPermission(false);
      this.callbacks.setScreenCaptureStatus("pending");
      this.callbacks.setRetryCount(0); // 重置重试计数
      console.log("录屏捕获已停止");
    } catch (error) {
      console.error("停止录屏捕获失败:", error);
    }
  }

  // 拖拽开始处理
  handleDragStart = (e: React.MouseEvent): void => {
    if (this.isMobile) return;

    this.callbacks.setIsDragging(true);
    this.refs.isDraggingRef.current = true;
    this.refs.dragStartXRef.current = e.clientX;
    this.refs.initialWidthRef.current = this.width;
    this.refs.dragStartTimeRef.current = Date.now();

    document.addEventListener("mousemove", this.handleDragMove);
    document.addEventListener("mouseup", this.handleDragEnd);
  };

  // 拖拽移动处理
  handleDragMove = (e: MouseEvent): void => {
    if (!this.refs.isDraggingRef.current) return;

    const deltaX = e.clientX - this.refs.dragStartXRef.current;
    const newWidth = Math.max(
      NARROW_INTERVIEW_WIDTH_VW,
      Math.min(
        80,
        this.refs.initialWidthRef.current - (deltaX / window.innerWidth) * 100,
      ),
    );
    
    // 当宽度小于最小值时，吸附到收缩宽度
    if (newWidth < MIN_INTERVIEW_WIDTH_VW) {
      this.callbacks.setWidth(NARROW_INTERVIEW_WIDTH_VW);
    } else {
      this.callbacks.setWidth(newWidth);
    }
  };

  // 拖拽结束处理
  handleDragEnd = (): void => {
    this.callbacks.setIsDragging(false);
    this.refs.isDraggingRef.current = false;

    document.removeEventListener("mousemove", this.handleDragMove);
    document.removeEventListener("mouseup", this.handleDragEnd);
    
    // 如果用户点击拖拽手柄，应该切换宽度
    const shouldFireClick = Date.now() - this.refs.dragStartTimeRef.current < 300;
    if (shouldFireClick) {
      this.callbacks.toggleWidth();
    }
  };

  // 获取扬声器状态信息
  getSpeakerStatusInfo(speakerStatus: DeviceStatus): StatusInfo {
    switch (speakerStatus) {
      case "ready":
        return { text: "扬声器已连接", color: "#4caf50", progress: 100 };
      case "error":
        return { text: "扬声器检测失败", color: "#ff6b6b", progress: 0 };
      case "unavailable":
        return { text: "未检测到扬声器", color: "#ffa726", progress: 0 };
      case "unauthorized":
        return { text: "扬声器权限被拒绝", color: "#ff6b6b", progress: 0 };
      default:
        return { text: "检测中...", color: "#ffa726", progress: 50 };
    }
  }

  // 获取网络状态信息
  getNetworkStatusInfo(networkStatus: NetworkStatus): StatusInfo {
    switch (networkStatus) {
      case "good":
        return { text: "网络连接良好", color: "#4caf50", progress: 100 };
      case "average":
        return { text: "网络连接一般", color: "#ffa726", progress: 70 };
      case "poor":
        return { text: "网络连接较差", color: "#ff6b6b", progress: 30 };
      default:
        return { text: "检测中...", color: "#ffa726", progress: 50 };
    }
  }

  // 获取录屏权限状态信息
  getScreenCaptureStatusInfo(
    screenCaptureStatus: ScreenCaptureStatus, 
    syncMode: SyncMode, 
    retryCount: number
  ): StatusInfo {
    // 如果是接收端模式，不需要录屏权限
    if (syncMode === SyncMode.RECEIVER) {
      return { text: "接收端无需录屏权限", color: "#4caf50", progress: 100 };
    }

    switch (screenCaptureStatus) {
      case "granted":
        return { 
          text: retryCount > 0 
            ? `录屏权限已获取 (重试${retryCount}次后成功)` 
            : "录屏权限已获取", 
          color: "#4caf50", 
          progress: 100 
        };
      case "denied":
        return { text: "录屏权限被拒绝", color: "#ff6b6b", progress: 0 };
      case "unavailable":
        return { text: "不支持录屏功能", color: "#ff6b6b", progress: 0 };
      case "pending":
      default:
        return { text: "未获取录屏权限(监听端需要录屏权限)", color: "#ffa726", progress: 0 };
    }
  }

  // 消息处理方法
  handleAddMessage = (text: string): void => {
    if (!text || text.trim() === "") return;

    const newMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      text: text.trim(),
      isInterviewer: true, // 扬声器模式默认为面试官
      timestamp: Date.now(),
    };

    this.callbacks.setMessages((prev) => [...prev, newMessage]);
  };

  // UI控制方法
  handleShowFromFloat = (): void => {
    this.callbacks.setIsMinimized(false);
    // this.isMobile = true;
  };

  handleMinimize = (): void => {
    if (this.isMobile) {
      this.callbacks.setIsMinimized(true);
    }
  };

  // 面试控制方法
  startInterview = (): void => {
    this.callbacks.setIsStarted(true);
  };

  handleStopInterview = (): void => {
    this.callbacks.setIsStarted(false);
    // 停止录屏捕获
    this.stopScreenCapture();
  };

  // 语言选择处理
  handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const language = e.target.value;
    this.callbacks.setRecognitionLanguage(language as RecognitionLanguage);
  };





  // 清理资源
  cleanup(): void {
    // 清理音频资源
    if (this.refs.testAudioContextRef.current) {
      this.refs.testAudioContextRef.current.close().catch(console.error);
    }
    // 清理录屏资源
    this.stopScreenCapture();
    // 移除拖拽事件监听器
    document.removeEventListener("mousemove", this.handleDragMove);
    document.removeEventListener("mouseup", this.handleDragEnd);
  }
} 