import React, { useState, useEffect, useRef } from "react";
import styles from "./interview-loudspeaker.module.scss";
import { InterviewUnderwayLoudspeaker } from "./interview-underway-loudspeaker";
import { Toaster } from "react-hot-toast";
import { MiniFloatWindow } from "./mini-float-window";
import { SyncMode, ACTIVATION_KEY_STRING } from "@/app/types/websocket-sync";
import RecorderIcon from "@/app/icons/record_light.svg";
import { useOutletContext } from "react-router-dom";

import WIFI from "@/app/icons/wifi.svg";
import SpeakerIcon from "@/app/icons/speaker.svg";

// 消息类型接口
interface Message {
  id: string;
  text: string;
  isInterviewer: boolean;
  timestamp: number;
}

// 扬声器设备接口
interface SpeakerDevice {
  deviceId: string;
  label: string;
}

// 定义Context类型
interface ChatOutletContext {
  onClose: () => void;
  onTextUpdate: (text: string) => void;
  submitMessage: (text: string) => void;
}

interface InterviewLoudspeakerProps {
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

// 设备状态类型
type DeviceStatus = "ready" | "error" | "unavailable" | "unauthorized";

// 网络状态类型
type NetworkStatus = "good" | "average" | "poor";

// 录屏权限状态类型
type ScreenCaptureStatus = "pending" | "granted" | "denied" | "unavailable";

export const InterviewLoudspeaker: React.FC = () => {
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

  // 扬声器和网络检查状态
  const [speakerStatus, setSpeakerStatus] =
    useState<DeviceStatus>("unavailable");
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("good");
  const [audioVolume, setAudioVolume] = useState<number>(50);

  // 录屏权限相关状态
  const [screenCaptureStatus, setScreenCaptureStatus] =
    useState<ScreenCaptureStatus>("pending");
  const [hasScreenPermission, setHasScreenPermission] = useState(false);

  // 扬声器设备相关状态
  const [speakerDevices, setSpeakerDevices] = useState<SpeakerDevice[]>([]);
  const [selectedSpeakerId, setSelectedSpeakerId] =
    useState<string>("system-default");
  const [showSpeakerDropdown, setShowSpeakerDropdown] = useState(false);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  // 添加语言选择状态 - 从localStorage初始化
  const [recognitionLanguage, setRecognitionLanguage] = useState<string>(
    localStorage.getItem("interviewLanguage") || "zh-CN",
  );

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

  // 显示悬浮窗的处理函数
  const handleShowFromFloat = () => {
    setIsMinimized(false);
  };

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

  // 检查扬声器状态
  const checkSpeakerStatus = async () => {
    try {
      // 获取音频输出设备列表
      await getAudioOutputDevices();

      // 创建测试音频元素
      const audio = new Audio();
      audioElementRef.current = audio;

      // 创建一个短暂的静音音频进行测试
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      testAudioContextRef.current = audioContext;

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

      setSpeakerStatus("ready");
      console.log("扬声器检查通过");
    } catch (error: any) {
      console.error("扬声器检测失败:", error);
      setSpeakerStatus("error");
    }
  };

  // 获取音频输出设备列表
  const getAudioOutputDevices = async () => {
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

      setSpeakerDevices([defaultDevice, ...audioOutputs]);
      console.log("找到扬声器设备:", audioOutputs.length + 1);
    } catch (error) {
      console.error("获取扬声器设备失败:", error);
      // 如果获取失败，至少提供默认选项
      setSpeakerDevices([{ deviceId: "system-default", label: "默认扬声器" }]);
    }
  };

  // 播放测试音频
  const playTestAudio = async () => {
    try {
      setIsPlayingTest(true);

      // 创建测试音频 - 使用一个简单的正弦波
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      // 设置音调和音量
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 音符
      gainNode.gain.setValueAtTime(
        (audioVolume / 100) * 0.1,
        audioContext.currentTime,
      ); // 控制音量

      // 连接节点
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // 播放 0.5 秒
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.5);

      // 清理
      setTimeout(() => {
        setIsPlayingTest(false);
        audioContext.close();
      }, 600);
    } catch (error) {
      console.error("播放测试音频失败:", error);
      setIsPlayingTest(false);
    }
  };

  // 选择扬声器设备
  const selectSpeakerDevice = async (deviceId: string) => {
    try {
      setSelectedSpeakerId(deviceId);
      setShowSpeakerDropdown(false);

      // 如果有音频元素，尝试设置输出设备
      if (audioElementRef.current && (audioElementRef.current as any).setSinkId) {
        await (audioElementRef.current as any).setSinkId(
          deviceId === "system-default" ? "" : deviceId,
        );
        console.log("已切换到扬声器:", deviceId);
      }
    } catch (error) {
      console.error("切换扬声器设备失败:", error);
    }
  };

  // 检测网络状态
  const checkNetworkStatus = () => {
    const connection = (navigator as any).connection;
    if (connection) {
      const speed = connection.downlink;
      if (speed >= 10) {
        setNetworkStatus("good");
      } else if (speed >= 1.5) {
        setNetworkStatus("average");
      } else {
        setNetworkStatus("poor");
      }
    } else {
      setNetworkStatus("good");
    }
  };

  // 获取录屏权限
  const requestScreenCapture = async () => {
    try {
      setScreenCaptureStatus("pending");
      console.log("开始请求录屏权限...");

      // 请求屏幕共享，但只要音频
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      mediaStreamRef.current = stream;

      // const [audioTrack] = stream.getAudioTracks();
      // if (audioTrack) {
      //   mediaStreamRef.current = new MediaStream([audioTrack]); // ← 纯音频流
      //   // 后续处理看下一节
      // }

      // 创建音频上下文
      // const AudioContext = window.AudioContext || window.webkitAudioContext;
      // const audioContext = new AudioContext();
      // audioContextRef.current = audioContext;

      // // 创建媒体流源
      // const source = audioContext.createMediaStreamSource(stream);

      // // 连接到目标（这会使音频可以被语音识别API识别）
      // const destination = audioContext.createMediaStreamDestination();
      // source.connect(destination);

      setScreenCaptureStatus("granted");
      setHasScreenPermission(true);
      console.log("录屏权限获取成功");

      // 监听流结束事件
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          console.log("录屏音频流已结束");
          stopScreenCapture();
        };
      });
    } catch (error: any) {
      console.error("获取录屏权限失败:", error);
      setScreenCaptureStatus("denied");
      setHasScreenPermission(false);

      if (error.name === "NotAllowedError") {
        alert("需要允许屏幕共享权限以捕获系统音频。请重新尝试并允许权限。");
      } else if (error.name === "NotSupportedError") {
        alert("您的浏览器不支持系统音频捕获功能。");
        setScreenCaptureStatus("unavailable");
      } else {
        alert("无法访问系统音频，请检查权限设置。");
      }
    }
  };

  // 停止录屏捕获
  const stopScreenCapture = () => {
    try {
      // 停止媒体流
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      // // 关闭音频上下文
      // if (audioContextRef.current) {
      //   audioContextRef.current.close();
      //   audioContextRef.current = null;
      // }

      setHasScreenPermission(false);
      setScreenCaptureStatus("pending");
      console.log("录屏捕获已停止");
    } catch (error) {
      console.error("停止录屏捕获失败:", error);
    }
  };

  // 音量调节处理
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseInt(e.target.value);
    setAudioVolume(volume);
    if (audioElementRef.current) {
      audioElementRef.current.volume = volume / 100;
    }
  };

  // 初始化时检测设备状态
  useEffect(() => {
    checkSpeakerStatus();
    checkNetworkStatus();

    return () => {
      // 清理音频资源
      if (testAudioContextRef.current) {
        testAudioContextRef.current.close().catch(console.error);
      }
      // 清理录屏资源
      stopScreenCapture();
    };
  }, []);

  // 开始面试
  const startInterview = () => {
    setIsStarted(true);
  };

  // 停止面试处理
  const handleStopInterview = () => {
    setIsStarted(false);
    // 停止录屏捕获
    stopScreenCapture();
  };

  // 语言选择处理
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const language = e.target.value;
    setRecognitionLanguage(language);
    localStorage.setItem("interviewLanguage", language);
  };

  // 拖拽相关处理函数
  const handleDragStart = (e: React.MouseEvent) => {
    if (isMobile) return;

    setIsDragging(true);
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    initialWidthRef.current = parseFloat(width);

    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - dragStartXRef.current;
    const newWidth = Math.max(
      20,
      Math.min(
        80,
        initialWidthRef.current - (deltaX / window.innerWidth) * 100,
      ),
    );
    setWidth(`${newWidth}vw`);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    isDraggingRef.current = false;

    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
  };

  // 获取扬声器状态信息
  const getSpeakerStatusInfo = () => {
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
  };

  // 获取网络状态信息
  const getNetworkStatusInfo = () => {
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
  };

  // 获取录屏权限状态信息
  const getScreenCaptureStatusInfo = () => {
    // 如果是接收端模式，不需要录屏权限
    if (syncMode === SyncMode.RECEIVER) {
      return { text: "接收端无需录屏权限", color: "#4caf50", progress: 100 };
    }

    switch (screenCaptureStatus) {
      case "granted":
        return { text: "录屏权限已获取", color: "#4caf50", progress: 100 };
      case "denied":
        return { text: "录屏权限被拒绝", color: "#ff6b6b", progress: 0 };
      case "unavailable":
        return { text: "不支持录屏功能", color: "#ff6b6b", progress: 0 };
      case "pending":
      default:
        return { text: "未获取录屏权限", color: "#ffa726", progress: 0 };
    }
  };

  // 面试准备UI组件
  const InterviewPreparationUI = () => {
    const speakerInfo = getSpeakerStatusInfo();
    const networkInfo = getNetworkStatusInfo();
    const screenCaptureInfo = getScreenCaptureStatusInfo();

    return (
      <div className={styles.preparationContainer}>
        <div className={styles.header}>
          <h2 className={styles.title}>面试准备就绪</h2>
          <div className={styles.subtitle}>请确认以下设置后开始面试</div>
        </div>

        {/* 同步功能设置 */}
        <div className={styles["setting-item"]}>
          <div className={styles["setting-label"]}>启用同步功能：</div>
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

        {/* 同步模式设置 */}
        {syncEnabled && (
          <div className={styles["setting-item"]}>
            <div className={styles["setting-label"]}>同步模式：</div>
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
                {syncMode === SyncMode.SENDER ? "发送端" : "接收端"}
              </span>
              <div className={styles["mode-description"]}>
                {syncMode === SyncMode.SENDER
                  ? "将语音识别结果发送给其他客户端进行回答"
                  : "接收发送端的语音识别结果"}
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
                  &nbsp;&nbsp;&nbsp;&nbsp;所有客户端需使用相同密钥
                </span>
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
                    onClick={requestScreenCapture}
                    // disabled={screenCaptureStatus === "pending" || screenCaptureStatus === "unavailable"}
                  >
                    {screenCaptureStatus === "pending"
                      ? "点击选择录屏权限"
                      : "获取录屏权限"}
                  </button>
                ) : (
                  <div className={styles.permissionGranted}>
                    <span>✅ 录屏权限已获取</span>
                    <button
                      className={styles.revokeButton}
                      onClick={stopScreenCapture}
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
                          onClick={() => selectSpeakerDevice(device.deviceId)}
                        >
                          {device.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 音量控制和测试按钮 */}
              <div className={styles.volumeControl}>
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
              </div>
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
                onChange={handleLanguageChange}
                className={styles.languageSelect}
              >
                <option value="zh-CN">中文 (普通话)</option>
                <option value="en-US">English (US)</option>
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
              (syncMode === SyncMode.SENDER && !hasScreenPermission)
            }
          >
            {speakerStatus !== "ready"
              ? "等待扬声器检测..."
              : syncMode === SyncMode.SENDER && !hasScreenPermission
              ? "请先获取录屏权限"
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
      {isMobile && isMinimized && (
        <MiniFloatWindow onShow={handleShowFromFloat} isVisible={true} />
      )}

      {/* 主界面 */}
      {visible && (!isMobile || !isMinimized) && (
        <div
          className={`${styles.overlay} ${
            isMobile ? styles.mobileOverlay : ""
          }`}
          style={isMobile ? {} : { width }}
        >
          {/* 拖拽边缘 */}
          {!isMobile && (
            <div className={styles.dragEdge} onMouseDown={handleDragStart} />
          )}

          {/* 关闭按钮 */}
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>

          {/* 手机模式最小化按钮 */}
          {isMobile && (
            <button
              className={styles.minimizeButton}
              onClick={() => setIsMinimized(true)}
            >
              ❌
            </button>
          )}

          <div className={styles.content}>
            {!isStarted ? (
              <InterviewPreparationUI />
            ) : (
              <InterviewUnderwayLoudspeaker
                visible={true}
                // voiceprintEnabled={false} // 扬声器模式不需要声纹识别
                recognitionLanguage={recognitionLanguage}
                // isInterviewer={true} // 所有语音都是面试官
                // voiceMatchScore={1.0} // 固定为100%匹配
                onTextUpdate={onTextUpdate}
                submitMessage={submitMessage}
                onStop={handleStopInterview}
                defaultAutoSubmit={true} // 扬声器模式默认开启自动提交
                mediaStream={mediaStreamRef.current}
                // audioContext={audioContextRef.current}
                onRequestPermission={requestScreenCapture}
                // 同步功能配置
                syncEnabled={syncEnabled}
                syncMode={syncMode}
                activationKey={activationKey}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};
