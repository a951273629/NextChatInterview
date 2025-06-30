import React, { useState, useEffect, useRef } from "react";
import styles from "./interview-loudspeaker.module.scss";
import { InterviewUnderwayLoudspeaker } from "./interview-underway-loudspeaker";
import { toast, Toaster } from "react-hot-toast";
import { MiniFloatWindow } from "./mini-float-window";
import { SyncMode, ACTIVATION_KEY_STRING } from "@/app/types/websocket-sync";
import RecorderIcon from "@/app/icons/record_light.svg";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useInterviewLanguage, LANGUAGE_OPTIONS, RecognitionLanguage } from "@/app/hooks/useInterviewLanguage";
import { useAppConfig } from "@/app/store";
import { NARROW_SIDEBAR_WIDTH, USER_RESUMES_STORAGE_KEY, USER_RESUMES_NAME_STORAGE_KEY,  } from "@/app/constant";
import clsx from "clsx";
import QRCode from "@/app/components/qr-code/qrcode";

import WIFI from "@/app/icons/wifi.svg";
import SpeakerIcon from "@/app/icons/speaker.svg";
import { useWebSocketSync } from "@/app/hooks/useWebSocketSync";
import { useChatStore, ChatMessage } from "@/app/store";
import { useInterviewChat } from "./chatStoreInterview";
import { 
  LoudspeakerService, 
  DeviceStatus, 
  NetworkStatus, 
  ScreenCaptureStatus, 
  SpeakerDevice,
  LoudspeakerServiceCallbacks,
  LoudspeakerServiceRefs,
  LoudspeakerServiceProps,
  Message
} from "./loudspeaker-service";
import { checkAzureSpeechUsage } from "./azureSpeech";
import { showConfirm } from "../ui-lib";

// 宽度管理常量
const DEFAULT_INTERVIEW_WIDTH_VW = 20;
const NARROW_INTERVIEW_WIDTH_VW = 10;
const MIN_INTERVIEW_WIDTH_VW = 14;



// 定义Context类型
interface ChatOutletContext {
  onClose: () => void;
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
  scrollToBottom: () => void;
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



export const InterviewLoudspeaker: React.FC = () => {
  // 从父路由获取context
  const { onClose, onTextUpdate, submitMessage, scrollToBottom } =
    useOutletContext<ChatOutletContext>();
  const [searchParams] = useSearchParams();

  // 获取应用配置用于控制侧边栏宽度
  const config = useAppConfig();
  // 获取聊天store用于注册WebSocket回调
  const chatStore = useChatStore();
  // 获取面试专用功能
  const interviewChat = useInterviewChat();

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

  // 扬声器和网络检查状态
  const [speakerStatus, setSpeakerStatus] =
    useState<DeviceStatus>("unavailable");
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("good");
  const [audioVolume, setAudioVolume] = useState<number>(50);

  // 录屏权限相关状态
  const [screenCaptureStatus, setScreenCaptureStatus] =
    useState<ScreenCaptureStatus>("pending");
  const [hasScreenPermission, setHasScreenPermission] = useState(false);

  // 简化重试机制状态
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // 扬声器设备相关状态
  const [speakerDevices, setSpeakerDevices] = useState<SpeakerDevice[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] =
    useState<string>("system-default");
  const [showSpeakerDropdown, setShowSpeakerDropdown] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  // 添加语言选择状态 - 使用新的钩子
  const [recognitionLanguage, setRecognitionLanguage] = useInterviewLanguage();

  const [activationKey, setActivationKey] = useState<string>(
    localStorage.getItem(ACTIVATION_KEY_STRING) || "",
  );

  // 音频相关引用
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const testAudioContextRef = useRef<AudioContext | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // 录屏相关引用
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // const audioContextRef = useRef<AudioContext | null>(null);

  // 添加同步功能相关状态
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncMode, setSyncMode] = useState<SyncMode>(SyncMode.SENDER);

  // 对端连接状态管理
  const [peerConnected, setPeerConnected] = useState(false);
  const [peerMode, setPeerMode] = useState<SyncMode | null>(null);
  // 使用面试专用功能获取会话
  // const targetSession = interviewChat.getCurrentInterviewSession();
  // WebSocket 同步功能 - 移到这里  
  const webSocketSync = useWebSocketSync({
    activationKey: (activationKey && activationKey.trim()) || "default_key",
    mode: syncMode,
    enabled: syncEnabled,

    onLLMResponse: (data) => {
      // 接收端处理LLM回答
      if (syncMode === SyncMode.RECEIVER) {
        console.log("🤖 接收到同步的LLM输出结果:", data);
        // 使用面试专用功能处理 LLM 响应
        interviewChat.handleLLMResponse(data);
        // 处理完LLM响应后滚动到底部
        scrollToBottom();
      }
    },
    onPeerStatusChange: (peerStatus) => {
      // 处理对端状态变化
      console.log("👥 对端状态更新:", peerStatus);
      setPeerConnected(peerStatus.connected);
      setPeerMode(peerStatus.mode === "sender" ? SyncMode.SENDER : SyncMode.RECEIVER);
    },

  });
  useEffect(()=>{
    checkAzureSpeechUsage().then((res)=>{
      // console.log("🔍 检查 Azure Speech 使用量:", JSON.stringify(res, null, 2) );
    }).catch((err)=>{
      console.error("❌ 检查 Azure Speech 使用量失败:", err);
    });
  },[])
  // 监听WebSocket连接状态变化，重置对端连接状态
  useEffect(() => {
    if (webSocketSync.connectionStatus !== "connected") {
      setPeerConnected(false);
      setPeerMode(null);
    }
  }, [webSocketSync.connectionStatus]);

  // 使用WebSocket提供的真实对端状态
  useEffect(() => {
    if (webSocketSync.peerStatus) {
      setPeerConnected(webSocketSync.peerStatus.connected);
      setPeerMode(webSocketSync.peerStatus.mode === "sender" ? SyncMode.SENDER : SyncMode.RECEIVER);
    }
  }, [webSocketSync.peerStatus]);

  // 注册WebSocket回调到chatStore，用于发送LLM输出到接收端
  useEffect(() => {
    if (syncEnabled && syncMode === SyncMode.SENDER) {
      // 在监听端模式下，注册WebSocket发送回调到chat store
      chatStore.setWebSocketCallback(webSocketSync.sendLLMResponse, syncMode);
    } 

    // 组件卸载时清除回调
    return () => {
      chatStore.setWebSocketCallback(null, null);
    };
  }, [syncEnabled, syncMode, webSocketSync.sendLLMResponse]);

  // 手机模式下默认设置
  useEffect(() => {
    if (isMobile && isMinimized == false) {
      setSyncEnabled(true);
      setSyncMode(SyncMode.RECEIVER);

      showConfirm("当前为手机模式，即将自动进入接收模式，点击确认后生效").then((res)=>{
        if(res){
          loudspeakerService.handleMinimize();
        }
      });
    }
  }, [isMobile,isMinimized]);



  // 处理点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowSpeakerDropdown(false);
      }
    };

    if (showSpeakerDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSpeakerDropdown]);

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

  // 创建服务回调
  const serviceCallbacks: LoudspeakerServiceCallbacks = {
    setSpeakerStatus,
    setSpeakerDevices,
    setSelectedSpeakerId,
    setShowSpeakerDropdown,
    setNetworkStatus,
    setScreenCaptureStatus,
    setHasScreenPermission,
    setRetryCount,
    setIsDragging,
    setWidth,
    toggleWidth,
    setMessages,
    setIsMinimized,
    setIsStarted,
    setRecognitionLanguage,
    setActivationKey,
  };

  // 创建服务引用
  const serviceRefs: LoudspeakerServiceRefs = {
    audioElementRef,
    testAudioContextRef,
    mediaStreamRef,
    isDraggingRef,
    dragStartXRef,
    initialWidthRef,
    dragStartTimeRef,
  };

  // 创建服务实例
  const loudspeakerService = new LoudspeakerService({
    callbacks: serviceCallbacks,
    refs: serviceRefs,
    retryCount,
    maxRetries,
    isMobile,
    width,
    webSocketSync,
    syncMode,
    activationKey,
  });

  // 更新服务状态
  loudspeakerService.updateProps({ retryCount, isMobile, width, webSocketSync, syncMode, activationKey });

  // 初始化时检测设备状态
  useEffect(() => {
    loudspeakerService.checkSpeakerStatus();
    loudspeakerService.checkNetworkStatus();

    return () => {
      loudspeakerService.cleanup();
    };
  }, []);

  // 开始面试
  const startInterview = () => {
    // 进入面试时将侧边栏宽度调整到最小
    config.update((config) => {
      config.sidebarWidth = NARROW_SIDEBAR_WIDTH;
    });
    loudspeakerService.startInterview();
  };





  useEffect(() => {
    if (syncMode === SyncMode.RECEIVER) {
      // 接收端模式下自动应用缩窄模式
      // 1. 设置面试组件的宽度
      setWidth(NARROW_INTERVIEW_WIDTH_VW);
      // 2. 同时缩窄主侧边栏
      config.update((config) => {
        config.sidebarWidth = NARROW_SIDEBAR_WIDTH;
      });
    }else{
      // 监听端模式下自动应用默认宽度
      setWidth(DEFAULT_INTERVIEW_WIDTH_VW);
      // 同时恢复主侧边栏的默认宽度
      config.update((config) => {
        config.sidebarWidth = DEFAULT_INTERVIEW_WIDTH_VW;
      });
    }
  }, [syncMode]);

  useEffect(() => {
    const wsKey = searchParams.get("wsKey");
    const wsMode = searchParams.get("wsMode");

    if (wsMode === 'receiver' && wsKey) {
      console.log("从URL参数中找到wsKey，设置激活密钥:", wsKey);
      setActivationKey(wsKey);
      localStorage.setItem(ACTIVATION_KEY_STRING, wsKey);

      console.log("从URL参数中找到wsMode=receiver，自动设置为接收端模式");
      setSyncEnabled(true);
      setSyncMode(SyncMode.RECEIVER);
      
    }
  }, [searchParams]);

  // 面试准备UI组件
  const InterviewPreparationUI = () => {
    const speakerInfo = loudspeakerService.getSpeakerStatusInfo(speakerStatus);
    const networkInfo = loudspeakerService.getNetworkStatusInfo(networkStatus);
    const screenCaptureInfo = loudspeakerService.getScreenCaptureStatusInfo(screenCaptureStatus, syncMode, retryCount);

    return (
      <div 
      className={clsx(
        styles.preparationContainer,
        {
          [styles.mobileOverlay]: isMobile,
          [styles["narrow-mode"]]: shouldNarrow && !isMobile,
        }
      )}
      >
        {/* <div className={styles.header}>
          <h2 className={styles.title}>面试准备就绪</h2>
          <div className={styles.subtitle}>请确认以下设置后开始面试</div>
        </div> */}

        {/* 同步功能设置 */}
        <div className={styles["setting-item"]}>
          <div className={styles["setting-label"]}>双端互通</div>
          <div className={styles["setting-control"]}>
            <label className={styles["switch"]}>
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => {
                  setSyncEnabled(e.target.checked);

                  if (!e.target.checked) {
                    setSyncMode(SyncMode.SENDER);
                  }
                }}
              />
              <span className={styles["slider"]}></span>
            </label>
            <span className={styles["setting-status"]}>
              {syncEnabled ? "已启用" : "已禁用"}
            </span>
          </div>
        </div>

        {/* 双端互通模式设置 */}
        {syncEnabled && (
          <div className={styles["setting-item"]}>
            <div className={styles["setting-label"]}>双端选择</div>
            <div className={styles["setting-control"]}>
              <label className={styles["switch"]}>
                <input
                  type="checkbox"
                  checked={syncMode === SyncMode.RECEIVER}
                  onChange={(e) =>
                    setSyncMode(
                      e.target.checked ? SyncMode.RECEIVER : SyncMode.SENDER,
                    )
                  }
                />
                <span className={styles["slider"]}></span>
              </label>
              <span className={styles["setting-status"]}>
                {syncMode === SyncMode.SENDER ? "目前是:监听端" : "目前是:接收端"}
              </span>
              <div className={styles["mode-description"]}>
                {syncMode === SyncMode.SENDER
                  ? "将语音识别结果发送给其他客户端进行回答"
                  : "接收监听端的语音识别结果 再发送给AI"}
              </div>
            </div>
          </div>
        )}

        {/* 激活密钥显示 */}
        {syncEnabled && (
          <div className={styles["setting-item"]}>
            <div className={styles["setting-label"]}>连接密钥：</div>
            <div className={styles["setting-control"]}>
              <div className={styles.activationKey}>
                <code style={{ color: "red" }}>{activationKey}</code>
                <span className={styles.keyDescription}>
                  &nbsp;&nbsp;&nbsp;&nbsp;【监听端】和【接收端】需使用相同密钥
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 扫码连接 */}
 
        {syncEnabled && syncMode === SyncMode.SENDER && (
          <div className={styles["setting-item"]}>
            <div className={styles["setting-label"]}>扫码连接</div>
            <div className={styles["setting-control"]}>
              <div style={{ background: 'white', padding: '10px', borderRadius: '8px', width: 'fit-content' }}>
                                 <QRCode 
                   text={`${window.location.origin}#/chat/interview-loudspeaker?wsKey=${activationKey}&wsMode=receiver`}
                   size={80}
                   alt="扫码连接接收端"
                 />
              </div>
              <div className={styles["mode-description"]}>
               打开微信,扫一扫,连接【接收端】
              </div>
            </div>
          </div>
        )}

        {/* WebSocket 连接状态显示 */}
        {syncEnabled && (
          <div className={styles["setting-item"]}>
            <div className={styles["setting-label"]}>连接状态：</div>
            <div className={styles["setting-control"]}>
              <div className={styles.connectionStatusContainer}>
                {/* 本端连接状态 */}
                <div className={styles.connectionItem}>
                  <span
                    className={`${styles.statusIndicator} ${
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
                  <span className={styles.connectionText}>
                    【{syncMode === SyncMode.SENDER ? "监听端" : "接收端"}: {
                      webSocketSync.connectionStatus === "connected"
                        ? "连接"
                        : webSocketSync.connectionStatus === "connecting"
                        ? "连接中"
                        : "未连接"
                    }】
                  </span>
                </div>
                
                {/* 对端连接状态 */}
                <div className={styles.connectionItem}>
                  <span
                    className={`${styles.statusIndicator} ${
                      peerConnected ? styles.connected : styles.disconnected
                    }`}
                  >
                    {peerConnected ? "🟢" : "🔴"}
                  </span>
                  <span className={styles.connectionText}>
                    【{syncMode === SyncMode.SENDER ? "接收端" : "监听端"}: {
                      peerConnected ? "连接" : "未连接"
                    }】
                  </span>
                </div>
                
                {/* 错误信息显示 */}
                {webSocketSync.lastError && (
                  <div className={styles.errorInfo}>
                    <span className={styles.errorText}>
                      错误: {webSocketSync.lastError}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 设备检查部分 */}
        <div className={styles.deviceCheck}>
          <h3 className={styles.sectionTitle}>设备检查</h3>

          {/* 录屏权限检查 */}
          <div className={styles.deviceItem}>
            <div className={styles.deviceIcon}>
              <RecorderIcon />
            </div>
            <div className={styles.deviceInfo}>
              <div className={styles.deviceName}>{screenCaptureInfo.text}</div>
              <div className={styles.progressContainer}>
                <div
                  className={styles.progressBar}
                  style={{
                    backgroundColor: screenCaptureInfo.color,
                    width: `${screenCaptureInfo.progress}%`,
                  }}
                />
              </div>

              {/* 录屏权限获取按钮 */}
              <div className={styles.screenCaptureControl}>
                {syncMode === SyncMode.RECEIVER ? (
                  <div className={styles.permissionGranted}>
                    <span>✅ 接收端模式，无需录屏权限</span>
                  </div>
                ) : !hasScreenPermission ? (
                  <button
                    className={styles.permissionButton}
                    onClick={() => loudspeakerService.requestScreenCapture()}
                    // disabled={screenCaptureStatus === "pending"}
                  >
                    {screenCaptureStatus === "pending" ? "点击选择录屏权限" : "获取录屏权限"}
                  </button>
                ) : (
                  <div className={styles.permissionGranted}>
                    <span>✅ 录屏权限已获取</span>
                    <button
                      className={styles.revokeButton}
                      onClick={() => loudspeakerService.stopScreenCapture()}
                    >
                      重新获取
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 扬声器检查 */}
          <div className={styles.deviceItem}>
            <div className={styles.deviceIcon}>
              <SpeakerIcon />
            </div>
            <div className={styles.deviceInfo}>
              <div className={styles.deviceName}>扬声器已连接</div>
              <div className={styles.progressContainer}>
                <div
                  className={styles.progressBar}
                  style={{
                    backgroundColor: speakerInfo.color,
                    width: `${speakerInfo.progress}%`,
                  }}
                />
              </div>

              {/* 扬声器选择下拉框 */}
              <div className={styles.speakerSelector}>
                <label className={styles.selectorLabel}>选择扬声器:</label>
                <div className={styles.dropdownContainer} ref={dropdownRef}>
                  <button
                    className={styles.dropdownButton}
                    onClick={() => setShowSpeakerDropdown(!showSpeakerDropdown)}
                  >
                    <span>
                      {speakerDevices.find(
                        (d) => d.deviceId === selectedSpeakerId,
                      )?.label || "默认扬声器"}
                    </span>
                    <span
                      className={`${styles.dropdownArrow} ${
                        showSpeakerDropdown ? styles.dropdownArrowUp : ""
                      }`}
                    >
                      ▼
                    </span>
                  </button>

                  {showSpeakerDropdown && (
                    <div className={styles.dropdownMenu}>
                      {speakerDevices.map((device) => (
                        <div
                          key={device.deviceId}
                          className={`${styles.dropdownItem} ${
                            selectedSpeakerId === device.deviceId
                              ? styles.dropdownItemSelected
                              : ""
                          }`}
                          onClick={() => loudspeakerService.selectSpeakerDevice(device.deviceId)}
                        >
                          {device.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 音量控制和测试按钮 */}
              {/* <div className={styles.volumeControl}>
                <span>音量:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume}
                  onChange={handleVolumeChange}
                  className={styles.volumeSlider}
                />
                <span>{audioVolume}%</span>
                <button
                  className={`${styles.testButton} ${
                    isPlayingTest ? styles.testButtonPlaying : ""
                  }`}
                  onClick={playTestAudio}
                  disabled={isPlayingTest}
                >
                  {isPlayingTest ? "播放中..." : "测试音频"}
                </button>
              </div> */}
            </div>
          </div>

          {/* 网络检查 */}
          <div className={styles.deviceItem}>
            <div className={styles.deviceIcon}>
              <WIFI />
            </div>
            <div className={styles.deviceInfo}>
              <div className={styles.deviceName}>{networkInfo.text}</div>
              <div className={styles.progressContainer}>
                <div
                  className={styles.progressBar}
                  style={{
                    backgroundColor: networkInfo.color,
                    width: `${networkInfo.progress}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 面试设置部分 */}
        <div className={styles.interviewSettings}>
          <h3 className={styles.sectionTitle}>面试设置</h3>

          {/* 识别语言设置 */}
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>识别语言：</div>
            <div className={styles.settingControl}>
              <select
                value={recognitionLanguage}
                onChange={loudspeakerService.handleLanguageChange}
                className={styles.languageSelect}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 开始按钮 */}
        <div className={styles.startButtonContainer}>
          <button
            onClick={startInterview}
            className={styles.startButton}
            disabled={
              speakerStatus !== "ready" ||
              (syncMode === SyncMode.SENDER && !hasScreenPermission) ||
              (syncEnabled && webSocketSync.connectionStatus !== "connected") ||
              (syncMode === SyncMode.RECEIVER)
            }
          >
            {speakerStatus !== "ready"
              ? "等待扬声器检测..."
              : syncMode === SyncMode.SENDER && !hasScreenPermission
              ? "请先获取录屏权限"
              : syncEnabled && webSocketSync.connectionStatus !== "connected"
              ? "等待WebSocket连接..."
              : syncMode === SyncMode.RECEIVER
              ? "当前为接收端"
              : "开始面试"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Toaster position="top-center" />

      {/* 手机模式悬浮窗 */}
      {isMobile && (isMinimized || (syncMode === SyncMode.RECEIVER && isStarted)) && (
        <MiniFloatWindow 
          onShow={loudspeakerService.handleShowFromFloat} 
          isVisible={true}
          text={syncMode === SyncMode.RECEIVER ? "正在接收" : "点击返回"}
          // icon={syncMode === SyncMode.RECEIVER ? "📡" : "🔊"}
        />
      )}

      {/* 主界面 */}
      {visible && (
        <div
          className={clsx(
            styles.overlay,
            {
              [styles.mobileOverlay]: isMobile,
              [styles["narrow-mode"]]: shouldNarrow && !isMobile,
            }
          )}
          style={{
            ...(isMobile ? {} : { width: `${width}vw` }),
            ...(isMobile && (isMinimized || (syncMode === SyncMode.RECEIVER && isStarted)) ? { display: "none" } : {})
          }}
        >
          {/* 拖拽边缘 */}
          {!isMobile && (
            <div className={styles.dragEdge} onMouseDown={loudspeakerService.handleDragStart} />
          )}

          {/* 关闭按钮 */}
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>

          {/* 手机模式最小化按钮 */}
          {isMobile && (
            <button
              className={styles.minimizeButton}
              onClick={loudspeakerService.handleMinimize}
            >
             -
            </button>
          )}

          <div className={styles.content}>
            {!isStarted ? (
              <InterviewPreparationUI />
            ) : (
              <>
                {syncEnabled && syncMode === SyncMode.SENDER && (
                  <div
                    style={{
                      color: "red",
                      textAlign: "center",
                      padding: "5px",
                    }}
                  >
                    当前是监听端，请打开接收端获取答案。
                  </div>
                )}
                <InterviewUnderwayLoudspeaker
                  visible={true}
                  recognitionLanguage={recognitionLanguage}
                  onTextUpdate={onTextUpdate}
                  submitMessage={submitMessage}
                  onStop={loudspeakerService.handleStopInterview}
                  defaultAutoSubmit={true}
                  mediaStream={mediaStreamRef.current}
                  onRequestPermission={() => loudspeakerService.requestScreenCapture()}
                  onMinimize={loudspeakerService.handleMinimize}
                  isMobile={isMobile}
                  messages={messages}
                  onAddMessage={loudspeakerService.handleAddMessage}
                  shouldNarrow={shouldNarrow}

                  //  onLLMResponse={undefined}
                  syncEnabled={syncEnabled}
                  syncMode={syncMode}
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

