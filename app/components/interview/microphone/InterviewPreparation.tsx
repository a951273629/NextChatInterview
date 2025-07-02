import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./InterviewPreparation.module.scss";
import { toast } from "react-hot-toast";
import { safeLocalStorage } from "@/app/utils";
import { useNavigate } from "react-router-dom";
import { Path, NARROW_SIDEBAR_WIDTH } from "@/app/constant";
import { useAppConfig } from "@/app/store";
import {
  useInterviewLanguage,
  RecognitionLanguage,
  LANGUAGE_OPTIONS,
} from "@/app/hooks/useInterviewLanguage";
// 导入SVG图标
import VoiceIcon from "@/app/icons/voice.svg";
import VoiceOffIcon from "@/app/icons/voice-off.svg";
import WIFI from "@/app/icons/wifi.svg";
import WIFIOff from "@/app/icons/wifi-off.svg";
import clsx from "clsx";

// import PowerIcon from "@/app/icons/power.svg";

const localStorage = safeLocalStorage();

interface InterviewPreparationProps {
  onStart: () => void;
  shouldNarrow: boolean;
  selectedMicId: string;
  onMicChange: (micId: string) => void;
}

// 设备状态类型
type DeviceStatus = "ready" | "error" | "unavailable" | "unauthorized";

// 网络状态类型
type NetworkStatus = "good" | "average" | "poor";

export const InterviewPreparation: React.FC<InterviewPreparationProps> = ({
  onStart,
  shouldNarrow,
  selectedMicId,
  onMicChange,
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
  
  // 麦克风设备列表和下拉菜单状态
  const [micList, setMicList] = useState<MediaDeviceInfo[]>([]);
  const [isMicListOpen, setIsMicListOpen] = useState(false);
  // 音频流和分析器引用
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | NodeJS.Timeout | null>(null);

  // 导航hook
  const navigate = useNavigate();

  // 初始化时检测设备状态
  useEffect(() => {
    console.log("准备组件已挂载，开始设备检查...");
    checkMicrophoneStatus();
    checkNetworkStatus();

    // 组件卸载时清理资源
    return () => {
      cleanupAudioResources();
    };
  }, []);



  // 监测麦克风音量
  const startVolumeMonitoring = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    // 防御性清理：确保在创建新定时器之前，旧的已停止
    if (animationFrameIdRef.current) {
      clearInterval(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    
    // 使用Float32Array获取时域数据进行正确的音量计算
    const dataArray = new Float32Array(analyser.fftSize);

    // 使用setInterval每500ms更新一次音量
    const intervalId = setInterval(() => {
      // 检查AudioContext状态
      if (audioContext.state === 'suspended') {
        console.log("AudioContext处于暂停状态，尝试恢复...");
        audioContext.resume().catch(err => {
          console.error("AudioContext恢复失败:", err);
        });
        return;
      }

      // 获取时域数据（用于音量计算）
      analyser.getFloatTimeDomainData(dataArray);

      // 计算RMS音量（均方根）
      let sumSquares = 0.0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      
      // 转换到0-100范围，并应用适当的增益
      const volume = Math.min(100, Math.max(0, rms * 1000)); // 增加增益使音量更明显
      
      // console.log("麦克风音量监测:", { 
      //   rms: rms.toFixed(4), 
      //   volume: volume.toFixed(1),
      //   audioContextState: audioContext.state,
      //   dataArrayLength: dataArray.length
      // });
      
      setMicVolume(volume);
    }, 500);

    // 保存intervalId以便清理
    animationFrameIdRef.current = intervalId;
  }, []);

  // 检测麦克风状态
  const checkMicrophoneStatus = useCallback(async () => {
    console.log("正在检查麦克风状态...");
    try {
      // 构建音频约束，如果有选定的设备ID就使用它
      const audioConstraints: MediaStreamConstraints['audio'] = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
      };
      
      if (selectedMicId) {
        audioConstraints.deviceId = { exact: selectedMicId };
      }
      
      // 检查麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      console.log("麦克风权限已获取，音频流已创建:", stream);
      audioStreamRef.current = stream;

      // 枚举可用的麦克风设备
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(device => device.kind === 'audioinput' && device.deviceId !== 'default');
        console.log("检测到的麦克风设备:", mics);
        setMicList(mics);
        
        // 如果没有选定的设备且有可用设备，选择第一个
        if (!selectedMicId && mics.length > 0) {
          onMicChange(mics[0].deviceId);
        }
      } catch (enumError) {
        console.error("枚举设备失败:", enumError);
      }

      // 创建音频分析器用于音量检测
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      console.log("AudioContext创建完成，初始状态:", audioContext.state);

      // 确保AudioContext处于运行状态
      if (audioContext.state === 'suspended') {
        console.log("AudioContext处于暂停状态，尝试激活...");
        try {
          await audioContext.resume();
          console.log("AudioContext已激活，当前状态:", audioContext.state);
        } catch (resumeError) {
          console.error("AudioContext激活失败:", resumeError);
        }
      }

      const analyser = audioContext.createAnalyser();
      // 优化分析器配置
      analyser.fftSize = 2048; // 增加分辨率
      analyser.smoothingTimeConstant = 0.8; // 添加平滑处理
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      console.log("音频分析器配置完成:", {
        fftSize: analyser.fftSize,
        frequencyBinCount: analyser.frequencyBinCount,
        smoothingTimeConstant: analyser.smoothingTimeConstant
      });

      // 验证音频流状态
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log("音频轨道信息:", {
          label: audioTracks[0].label,
          enabled: audioTracks[0].enabled,
          readyState: audioTracks[0].readyState,
          settings: audioTracks[0].getSettings()
        });
      }

      // 开始监测音量
      startVolumeMonitoring();

      // 添加音量检测验证测试
      setTimeout(() => {
        if (analyserRef.current && audioContextRef.current) {
          console.log("🔍 执行音量检测验证测试...");
          const testDataArray = new Float32Array(analyserRef.current.fftSize);
          analyserRef.current.getFloatTimeDomainData(testDataArray);
          
          let hasNonZeroData = false;
          for (let i = 0; i < Math.min(100, testDataArray.length); i++) {
            if (Math.abs(testDataArray[i]) > 0.001) {
              hasNonZeroData = true;
              break;
            }
          }
          
          console.log("音量检测验证结果:", {
            hasAudioData: hasNonZeroData,
            sampleDataRange: `${testDataArray[0].toFixed(4)} to ${testDataArray[Math.min(99, testDataArray.length-1)].toFixed(4)}`,
            contextState: audioContextRef.current.state
          });
          
          if (!hasNonZeroData) {
            console.warn("⚠️ 警告：检测到的音频数据全为零，可能存在问题");
          } else {
            console.log("✅ 音频数据检测正常");
          }
        }
      }, 2000); // 2秒后进行测试

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
  }, [selectedMicId, onMicChange, startVolumeMonitoring]);

  // 清理音频资源
  const cleanupAudioResources = () => {
    console.log("🧹 清理音频资源...");
    
    if (animationFrameIdRef.current) {
      clearInterval(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      console.log("✅ 音量监测定时器已清理");
    }

    if (audioContextRef.current) {
      // 检查AudioContext状态再关闭
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch((err) => {
          console.error("关闭音频上下文失败:", err);
        });
      }
      audioContextRef.current = null;
      console.log("✅ AudioContext已关闭");
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log("✅ 音频轨道已停止:", track.label || track.kind);
      });
      audioStreamRef.current = null;
      console.log("✅ 音频流已释放");
    }

    // 重置分析器引用
    analyserRef.current = null;
    console.log("✅ 分析器引用已清理");
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

  // 处理语言选择
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRecognitionLanguage(e.target.value as RecognitionLanguage);
  };

  // 处理麦克风设备选择
  const handleMicrophoneSelect = (deviceId: string) => {
    onMicChange(deviceId);
    setIsMicListOpen(false);
    // 重新检测麦克风状态
    setTimeout(() => {
      checkMicrophoneStatus();
    }, 100);
  };

  // 切换麦克风选择下拉菜单
  const toggleMicList = () => {
    setIsMicListOpen(!isMicListOpen);
  };

  // 获取选定麦克风的显示名称
  const getSelectedMicName = () => {
    if (!selectedMicId) return "默认麦克风";
    const selectedMic = micList.find(mic => mic.deviceId === selectedMicId);
    return selectedMic?.label || "未知设备";
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
          <div className={styles["mic-select-container"]}>
            <div
              className={`${styles["device-status-item"]} ${
                styles[micStatusInfo.colorClass]
              }`}
              onClick={toggleMicList}
            >
              <div className={styles["status-icon"]}>{micStatusInfo.icon}</div>
              <div className={styles["status-info"]}>
                <div className={styles["status-text"]}>
                  {micStatus === "ready" ? getSelectedMicName() : micStatusInfo.text}
                </div>
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
              {micStatus === "ready" && micList.length > 1 && (
                <div className={styles["dropdown-arrow"]}>▼</div>
              )}
            </div>

            {/* 麦克风设备选择下拉菜单 */}
            {isMicListOpen && micStatus === "ready" && micList.length > 0 && (
              <div className={styles["mic-list"]}>
                {micList.map((mic) => (
                  <div
                    key={mic.deviceId}
                    className={`${styles["mic-option"]} ${
                      selectedMicId === mic.deviceId ? styles["selected"] : ""
                    }`}
                    onClick={() => handleMicrophoneSelect(mic.deviceId)}
                  >
                    {mic.label || "未知设备"}
                  </div>
                ))}
              </div>
            )}
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

      {/* 操作按钮区域 */}
      <div className={styles["prep-footer"]}>
        <button
          className={`${styles["start-button"]} ${
            micStatus !== "ready" ? styles["disabled"] : ""
          }`}
          onClick={handleStartInterview}
          disabled={micStatus !== "ready"}
        >
          开始面试
        </button>
      </div>
    </div>
  );
};

export default InterviewPreparation;
