import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./InterviewPreparation.module.scss";
import { toast } from "react-hot-toast";
import { useActivation } from "../../valid-wrapper/ActivationWrapper";
import ActivationStatus from "../../valid-wrapper/ActivationStatus";
import { safeLocalStorage } from "@/app/utils";
import { useNavigate } from "react-router-dom";
import { Path, NARROW_SIDEBAR_WIDTH } from "@/app/constant";
import { ACTIVATION_KEY } from "../../valid-wrapper/activation";
import { useAppConfig } from "@/app/store";
import {
  useInterviewLanguage,
  RecognitionLanguage,
  LANGUAGE_OPTIONS,
} from "@/app/hooks/useInterviewLanguage";
// 导入声纹存储服务
import { voiceprintStorage } from "../../tensor-flow/services/voiceprint-storage";
// 导入SVG图标
import VoiceIcon from "@/app/icons/voice.svg";
import VoiceOffIcon from "@/app/icons/voice-off.svg";
import WIFI from "@/app/icons/wifi.svg";
import WIFIOff from "@/app/icons/wifi-off.svg";
import clsx from "clsx";

// import PowerIcon from "@/app/icons/power.svg";

const localStorage = safeLocalStorage();

interface InterviewPreparationProps {
  voiceprintEnabled: boolean;
  setVoiceprintEnabled: (enabled: boolean) => void;
  onStart: () => void;
  shouldNarrow: boolean;
}

// 设备状态类型
type DeviceStatus = "ready" | "error" | "unavailable" | "unauthorized";

// 网络状态类型
type NetworkStatus = "good" | "average" | "poor";

export const InterviewPreparation: React.FC<InterviewPreparationProps> = ({
  voiceprintEnabled,
  setVoiceprintEnabled,
  onStart,
  shouldNarrow,
}) => {
  // 使用语言Context替代本地状态
  const [recognitionLanguage, setRecognitionLanguage] = useInterviewLanguage();
  
  // 获取应用配置用于控制侧边栏宽度
  const config = useAppConfig();

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

  // 判断是否已激活
  const [isActivated, setIsActivated] = useState<boolean>(false);

  // 导航hook
  const navigate = useNavigate();

  // 声纹数据是否存在
  const [hasVoiceprint, setHasVoiceprint] = useState<boolean>(false);

  useEffect(() => {
    // 检查本地存储中的激活状态
    const checkActivationStatus = () => {
      const status = localStorage.getItem(ACTIVATION_KEY);
      if (status === "active") {
        setIsActivated(true);
        clearInterval(intervalActive);
      }
    };

    const intervalActive = setInterval(() => {
      console.log("check active status");
      checkActivationStatus();
    }, 2000);

    checkActivationStatus();
    return () => {
      clearInterval(intervalActive);
    };
  }, []);

  // 检查声纹数据是否存在
  useEffect(() => {
    const checkVoiceprintExists = async () => {
      try {
        const voiceprint = await voiceprintStorage.getVoiceprint();
        setHasVoiceprint(voiceprint !== null);
      } catch (error) {
        console.error("检查声纹数据失败:", error);
        setHasVoiceprint(false);
      }
    };

    checkVoiceprintExists();
  }, []);

  // 初始化时检测设备状态
  useEffect(() => {
    checkMicrophoneStatus();
    checkNetworkStatus();

    // 组件卸载时清理资源
    return () => {
      cleanupAudioResources();
    };
  }, []);

  // 获取激活检查函数
  const { checkActivation } = useActivation();

  // 监测麦克风音量
  const startVolumeMonitoring = useCallback(() => {
    if (!analyserRef.current) return;

    // 防御性清理：确保在创建新定时器之前，旧的已停止
    if (animationFrameIdRef.current) {
      clearInterval(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

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
  }, []);

  // 检测麦克风状态
  const checkMicrophoneStatus = useCallback(async () => {
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
  }, [startVolumeMonitoring]);

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

  // 导航到TensorFlow页面进行声纹训练
  const navigateToTensorFlow = () => {
    navigate(Path.TensorFlow);
  };

  // 处理对话框确认事件
  const handleDialogConfirm = () => {
    setDialogOpen(false);
    navigateToTensorFlow();
  };

  // 处理语言选择
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRecognitionLanguage(e.target.value as RecognitionLanguage);
  };

  // 开始面试，传递选择的语言
  const handleStartInterview = () => {
    // 进入面试时将侧边栏宽度调整到最小
    config.update((config) => {
      config.sidebarWidth = NARROW_SIDEBAR_WIDTH;
    });
    onStart();
  };

  // 获取麦克风状态对应的图标和文字
  const getMicStatusInfo = () => {
    switch (micStatus) {
      case "ready":
        return {
          icon: <VoiceIcon />,
          text: "麦克风已连接",
          colorClass: "status-success",
        };
      case "unauthorized":
        return {
          icon: <VoiceOffIcon />,
          text: "麦克风访问被拒绝，请授予权限",
          colorClass: "status-error",
        };
      case "unavailable":
        return {
          icon: <VoiceOffIcon />,
          text: "未检测到麦克风设备",
          colorClass: "status-error",
        };
      case "error":
        return {
          icon: <VoiceOffIcon />,
          text: "麦克风出现未知错误",
          colorClass: "status-error",
        };
      default:
        return {
          icon: <VoiceOffIcon />,
          text: "正在检测麦克风...",
          colorClass: "",
        };
    }
  };

  // 获取网络状态对应的图标和文字
  const getNetworkStatusInfo = () => {
    switch (networkStatus) {
      case "good":
        return {
          icon: <WIFI />,
          text: "网络连接良好",
          colorClass: "status-success",
        };
      case "average":
        return {
          icon: <WIFI />,
          text: "网络连接一般",
          colorClass: "status-warning",
        };
      case "poor":
        return {
          icon: <WIFI />,
          text: "网络连接较差，可能影响面试",
          colorClass: "status-error",
        };
      default:
        return { icon: <WIFIOff />, text: "正在检测网络...", colorClass: "" };
    }
  };

  const micStatusInfo = getMicStatusInfo();
  const networkStatusInfo = getNetworkStatusInfo();

  return (
    <div
      className={clsx(styles["interview-prep-container"], {
        [styles["narrow-mode"]]: shouldNarrow,
      })}
    >
      <div className={styles["prep-header"]}>
        <h3>面试准备就绪</h3>
        <ActivationStatus className={styles["activation-status"]} />
        <p>请确认以下设置后开始面试</p>
      </div>

      <div className={styles["prep-main-content"]}>
        {/* 简历上传组件
        <div className={styles["prep-section"]}>
          <PreparationResumesUpload />
        </div> */}

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
          <div
            className={`${styles["setting-item"]} ${
              !hasVoiceprint ? styles["clickable-setting"] : ""
            }`}
            onClick={() => !hasVoiceprint && navigateToTensorFlow()}
            style={{ cursor: !hasVoiceprint ? "pointer" : "default" }}
          >
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
                  未找到声纹数据，请先在TensorFlow页面训练声纹 (点击此区域跳转)
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
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮区域
      <div className={styles["prep-footer"]}>
        <button
          className={`${styles["start-button"]} ${
            micStatus !== "ready" || !isActivated ? styles["disabled"] : ""
          }`}
          onClick={() => {
            checkActivation(() => handleStartInterview());
          }}
          disabled={micStatus !== "ready"}
        >
          {isActivated ? "开始面试" : "请先激活"}
        </button>
      </div> */}

<div className={styles["prep-footer"]}>
        <button
          className={`${styles["start-button"]} ${
            micStatus !== "ready" || !isActivated ? styles["disabled"] : ""
          }`}
          onClick={() => {
            checkActivation(() => handleStartInterview());
          }}
          disabled={micStatus !== "ready"}
        >
          {isActivated ? "开始面试" : "请先激活"}
        </button>
      </div>

    </div>
  );
};

export default InterviewPreparation;
