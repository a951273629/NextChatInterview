import React, { useEffect, useRef, useState } from "react";
import styles from "./InterviewPreparation.module.scss";
import DialogBox from "./comm/DialogBox";
import { toast } from "react-hot-toast";
import PreparationResumesUpload from "./preparation-resumes-upload";

interface InterviewPreparationProps {
  voiceprintEnabled: boolean;
  setVoiceprintEnabled: (enabled: boolean) => void;
  onStart: () => void;
}

// 语言选择类型
type RecognitionLanguage = "zh-CN" | "en-US";

// 设备状态类型
type DeviceStatus = "ready" | "error" | "unavailable" | "unauthorized";

// 网络状态类型
type NetworkStatus = "good" | "average" | "poor";

export const InterviewPreparation: React.FC<InterviewPreparationProps> = ({
  voiceprintEnabled,
  setVoiceprintEnabled,
  onStart,
}) => {
  // 语言选择状态
  const [recognitionLanguage, setRecognitionLanguage] =
    useState<RecognitionLanguage>("zh-CN");

  // 麦克风状态
  const [micStatus, setMicStatus] = useState<DeviceStatus>("unavailable");
  const [micVolume, setMicVolume] = useState<number>(0);

  // 网络状态
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("good");
  // 音频流和分析器引用
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | NodeJS.Timeout | null>(null);

  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);

  // 初始化时检测设备状态
  useEffect(() => {
    checkMicrophoneStatus();
    checkNetworkStatus();

    // 组件卸载时清理资源
    return () => {
      cleanupAudioResources();
    };
  }, []);

  // 检测麦克风状态
  const checkMicrophoneStatus = async () => {
    try {
      // 检查麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // 创建音频分析器用于音量检测
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // 开始监测音量
      startVolumeMonitoring();

      setMicStatus("ready");
    } catch (error: any) {
      console.error("麦克风检测失败:", error);

      // 根据错误类型设置不同的状态
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        setMicStatus("unauthorized");
      } else if (error.name === "NotFoundError") {
        setMicStatus("unavailable");
      } else {
        setMicStatus("error");
      }
    }
  };

  // 监测麦克风音量
  const startVolumeMonitoring = () => {
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // 使用setInterval每100ms更新一次音量
    const intervalId = setInterval(() => {
      analyser.getByteFrequencyData(dataArray);

      // 计算音量平均值
      let sum = 0;
      dataArray.forEach((value) => {
        sum += value;
      });
      const average = sum / dataArray.length;

      // 归一化到0-100范围
      const volume = Math.min(100, Math.max(0, average));
      setMicVolume(volume);
    }, 100);

    // 保存intervalId以便清理
    animationFrameIdRef.current = intervalId;
  };

  // 清理音频资源
  const cleanupAudioResources = () => {
    if (animationFrameIdRef.current) {
      clearInterval(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch((err) => {
        console.error("关闭音频上下文失败:", err);
      });
      audioContextRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      audioStreamRef.current = null;
    }
  };

  // 检测网络状态
  const checkNetworkStatus = () => {
    // 使用 navigator.connection API (如果可用)
    if ("connection" in navigator && navigator.connection) {
      const connection = (navigator as any).connection;

      // 监听网络变化
      connection.addEventListener("change", updateNetworkStatus);

      // 初始状态更新
      updateNetworkStatus();
    } else {
      // 如果API不可用，默认假设网络状态良好
      setNetworkStatus("good");
    }
  };

  // 更新网络状态
  const updateNetworkStatus = () => {
    if (!("connection" in navigator)) return;

    const connection = (navigator as any).connection;

    if (connection.downlink >= 5) {
      setNetworkStatus("good");
    } else if (connection.downlink >= 2) {
      setNetworkStatus("average");
    } else {
      setNetworkStatus("poor");
    }
  };

  // 切换声纹识别功能
  const handleVoiceprintToggle = () => {
    const hasVoiceprint = localStorage.getItem("userVoiceprint") !== null;

    if (!hasVoiceprint) {
      // 如果没有声纹数据，显示对话框
      setDialogOpen(true);
    } else {
      // 如果有声纹数据，启用声纹识别并显示Toast
      const newState = !voiceprintEnabled;
      setVoiceprintEnabled(newState);

      // 显示成功Toast
      if (newState) {
        toast.success("声纹识别已开启成功！", {
          duration: 3000,
          style: {
            border: "1px solid #4CAF50",
            padding: "16px",
            color: "#333",
          },
        });
      } else {
        toast("声纹识别已关闭", {
          duration: 2000,
          icon: "💤",
        });
      }
    }
  };

  // 处理对话框确认事件
  const handleDialogConfirm = () => {
    setDialogOpen(false);
    // 可以在这里添加导航到TensorFlow页面的逻辑
  };

  // 处理语言选择
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRecognitionLanguage(e.target.value as RecognitionLanguage);
  };

  // 开始面试，传递选择的语言
  const handleStartInterview = () => {
    // 在开始面试前，保存选择的语言到localStorage
    localStorage.setItem("interviewLanguage", recognitionLanguage);
    onStart();
  };

  // 获取麦克风状态对应的图标和文字
  const getMicStatusInfo = () => {
    switch (micStatus) {
      case "ready":
        return {
          icon: "🎙️",
          text: "麦克风已连接",
          colorClass: "status-success",
        };
      case "unauthorized":
        return {
          icon: "🚫",
          text: "麦克风访问被拒绝，请授予权限",
          colorClass: "status-error",
        };
      case "unavailable":
        return {
          icon: "❓",
          text: "未检测到麦克风设备",
          colorClass: "status-error",
        };
      case "error":
        return {
          icon: "⚠️",
          text: "麦克风出现未知错误",
          colorClass: "status-error",
        };
      default:
        return { icon: "⏳", text: "正在检测麦克风...", colorClass: "" };
    }
  };

  // 获取网络状态对应的图标和文字
  const getNetworkStatusInfo = () => {
    switch (networkStatus) {
      case "good":
        return {
          icon: "📶",
          text: "网络连接良好",
          colorClass: "status-success",
        };
      case "average":
        return {
          icon: "📶",
          text: "网络连接一般",
          colorClass: "status-warning",
        };
      case "poor":
        return {
          icon: "📶",
          text: "网络连接较差，可能影响面试",
          colorClass: "status-error",
        };
      default:
        return { icon: "📶", text: "正在检测网络...", colorClass: "" };
    }
  };

  const micStatusInfo = getMicStatusInfo();
  const networkStatusInfo = getNetworkStatusInfo();
  const hasVoiceprint = localStorage.getItem("userVoiceprint") !== null;

  return (
    <div className={styles["interview-prep-container"]}>
      <div className={styles["prep-header"]}>
        <h3>面试准备就绪</h3>
        <p>请确认以下设置后开始面试</p>
      </div>

      <div className={styles["prep-main-content"]}>
        {/* 简历上传组件 */}
        <div className={styles["prep-section"]}>
          <PreparationResumesUpload />
        </div>

        {/* 设备检查区域 */}
        <div
          className={`${styles["prep-section"]} ${styles["device-check-section"]}`}
        >
          <h4 className={styles["section-title"]}>设备检查</h4>

          {/* 麦克风检查 */}
          <div
            className={`${styles["device-status-item"]} ${
              styles[micStatusInfo.colorClass]
            }`}
          >
            <div className={styles["status-icon"]}>{micStatusInfo.icon}</div>
            <div className={styles["status-info"]}>
              <div className={styles["status-text"]}>{micStatusInfo.text}</div>
              {micStatus === "ready" && (
                <div className={styles["volume-indicator"]}>
                  <div className={styles["volume-bar-container"]}>
                    <div
                      className={styles["volume-bar"]}
                      style={{ width: `${micVolume}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 网络检查 */}
          <div
            className={`${styles["device-status-item"]} ${
              styles[networkStatusInfo.colorClass]
            }`}
          >
            <div className={styles["status-icon"]}>
              {networkStatusInfo.icon}
            </div>
            <div className={styles["status-info"]}>
              <div className={styles["status-text"]}>
                {networkStatusInfo.text}
              </div>
            </div>
          </div>
        </div>

        {/* 面试设置区域 */}
        <div
          className={`${styles["prep-section"]} ${styles["settings-section"]}`}
        >
          <h4 className={styles["section-title"]}>面试设置</h4>

          {/* 声纹识别设置 */}
          <div className={styles["setting-item"]}>
            <div className={styles["setting-label"]}>声纹识别：</div>
            <div className={styles["setting-control"]}>
              <label className={styles["switch"]}>
                <input
                  type="checkbox"
                  checked={voiceprintEnabled}
                  onChange={handleVoiceprintToggle}
                  disabled={!hasVoiceprint}
                />
                <span
                  className={`${styles["slider"]} ${
                    !hasVoiceprint ? styles["disabled"] : ""
                  }`}
                ></span>
              </label>
              <span className={styles["setting-status"]}>
                {voiceprintEnabled ? "已启用" : "已禁用"}
              </span>
              {!hasVoiceprint && (
                <div className={styles["setting-warning"]}>
                  未找到声纹数据，请先在TensorFlow页面训练声纹
                </div>
              )}
            </div>
          </div>

          {/* 语言选择设置 */}
          <div className={styles["setting-item"]}>
            <div className={styles["setting-label"]}>识别语言：</div>
            <div className={styles["setting-control"]}>
              <select
                className={styles["language-select"]}
                value={recognitionLanguage}
                onChange={handleLanguageChange}
              >
                <option value="zh-CN">中文 (普通话)</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮区域 */}
      <div className={styles["prep-footer"]}>
        <button
          className={`${styles["button"]} ${styles["start-button"]} ${
            micStatus !== "ready" ? styles["disabled"] : ""
          }`}
          onClick={handleStartInterview}
          disabled={micStatus !== "ready"}
        >
          开始面试
        </button>
      </div>

      {/* 自定义对话框 */}
      <DialogBox
        isOpen={dialogOpen}
        title="声纹识别未配置"
        content={
          <div>
            <p>您尚未录制声纹，无法启用声纹识别功能。</p>
            <p>请先前往TensorFlow页面录制并训练您的声纹。</p>
          </div>
        }
        confirmText="去训练声纹"
        cancelText="取消"
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
};

export default InterviewPreparation;
