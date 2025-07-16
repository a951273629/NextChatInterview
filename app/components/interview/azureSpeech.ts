import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { billingService } from "@/app/services/BillingService";
let index = 0;
// Azure Speech 配置接口
export interface AzureSpeechConfig {
  subscriptionKey: string;
  region: string;
  language: string;
}

// 语音识别结果回调类型
export type SpeechRecognitionCallback = (
  text: string,
  isFinal: boolean,
) => void;
export type SpeechErrorCallback = (error: string) => void;
export type SpeechEndCallback = () => void;

// Azure Speech API 使用量检查相关类型
export interface AzureSpeechUsageInfo {
  success: boolean;
  message?: string;
  serviceInfo?: {
    region: string;
    endpoint: string;
    availableVoices: number;
    keyStatus: string;
  };
  quotaInfo?: {
    freeQuota: {
      speechToText: string;
      textToSpeech: string;
    };
    standardQuota: {
      speechToText: string;
      textToSpeech: string;
    };
  };
  usageNotes?: string[];
  checkTime?: string;
  error?: string;
  details?: any;
}

export interface AzureSpeechDetailedUsageRequest {
  includeMetrics?: boolean;
}

export interface AzureSpeechDetailedUsageInfo extends AzureSpeechUsageInfo {
  detailedMetrics?: any;
  recommendations?: string[];
}

// 简化的 Azure Speech 识别器类
export class AzureSpeechRecognizer {
  private speechConfig: SpeechSDK.SpeechConfig | null = null;
  private recognizer: SpeechSDK.SpeechRecognizer | null = null;
  private audioConfig: SpeechSDK.AudioConfig | null = null;
  private isListening: boolean = false;
  private config: AzureSpeechConfig;

  constructor(config: AzureSpeechConfig) {
    this.config = config;
    this.initializeSpeechConfig(config);
  }

  private initializeSpeechConfig(config: AzureSpeechConfig) {
    try {
      console.log("🔧 初始化 Azure Speech 配置:", {
        region: config.region,
        language: config.language,
      });

      this.speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
        config.subscriptionKey,
        config.region,
      );

      // 设置识别模式为连续识别
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
        "15000",
      );
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
        "2000",
      );

      // 🎯 关键修复：设置断句静默超时为2秒
      // 这将确保在人声停止2秒后才进行断句处理
      // this.speechConfig.setProperty(
      //   SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs,
      //   "2500",
      // );

      console.log("✅ Azure Speech 配置初始化成功");
    } catch (error) {
      console.error("❌ 初始化 Azure Speech 配置失败:", error);
      throw error;
    }
  }

  // 简化版：直接从 MediaStream 创建音频配置
  public createAudioConfigFromStream(mediaStream: MediaStream): void {
    try {
      // console.log("🎵 开始创建音频配置...");
      // console.log("📡 MediaStream 信息:", {
      //   active: mediaStream.active,
      //   audioTracks: mediaStream.getAudioTracks().length,
      //   videoTracks: mediaStream.getVideoTracks().length,
      // });

      // 1. 提取音频轨道
      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error("MediaStream 中没有音频轨道");
      }

      const audioTrack = audioTracks[0];
      // console.log("🎤 音频轨道信息:", {
      //   kind: audioTrack.kind,
      //   label: audioTrack.label,
      //   enabled: audioTrack.enabled,
      //   readyState: audioTrack.readyState,
      //   settings: audioTrack.getSettings(),
      // });

      // 2. 创建纯音频 MediaStream
      const audioOnlyStream = new MediaStream([audioTrack]);
      // console.log("🎧 创建纯音频流:", {
      //   active: audioOnlyStream.active,
      //   audioTracks: audioOnlyStream.getAudioTracks().length,
      // });

      // 3. 直接使用 Azure Speech SDK 的 fromStreamInput
      this.audioConfig = SpeechSDK.AudioConfig.fromStreamInput(audioOnlyStream);
      console.log("✅ 音频配置创建成功");
    } catch (error) {
      console.error("❌ 创建音频配置失败:", error);
      throw error;
    }
  }

  // 开始连续语音识别
  public startContinuousRecognition(
    onResult: SpeechRecognitionCallback,
    onError: SpeechErrorCallback,
    onEnd: SpeechEndCallback,
  ): void {
    if (!this.speechConfig || !this.audioConfig) {
      throw new Error("Speech 配置或音频配置未初始化");
    }

    try {
      // console.log("🚀 开始创建语音识别器...");

      // 根据语言配置决定识别模式
      if (this.config.language === "auto-detect") {
        // 中英混合模式：使用自动语言检测
        console.log("🌐 启用中英混合语言识别模式");
        const autoDetectSourceLanguageConfig =
          SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages([
            "zh-CN",
            "en-US",
          ]);

        // 创建支持多语言自动检测的语音识别器
        this.recognizer = SpeechSDK.SpeechRecognizer.FromConfig(
          this.speechConfig,
          autoDetectSourceLanguageConfig,
          this.audioConfig,
        );
      } else {
        // 单语言模式：使用指定语言
        console.log("🔤 启用单语言识别模式:", this.config.language);
        this.speechConfig.speechRecognitionLanguage = this.config.language;

        // 创建标准语音识别器
        this.recognizer = new SpeechSDK.SpeechRecognizer(
          this.speechConfig,
          this.audioConfig,
        );
      }

      // 处理识别中的结果（部分结果）
      this.recognizer.recognizing = (s, e) => {
        if (e.result && e.result.text) {
          // console.log("🔄 识别中:", e.result.text);
          onResult(e.result.text, false);
        }
      };

      // 处理识别完成的结果（最终结果）
      this.recognizer.recognized = (s, e) => {
        if (e.result && e.result.text) {
          // console.log("✅ 最终识别结果:", e.result.text);

          // 🎯 Azure Speech 扣费：每次识别完成扣费2点
          billingService.chargeForAzureSpeech();

          onResult(e.result.text, true);
        } else {
          // console.log("ℹ️ 识别结果为空或无效:", e.result);
        }
      };

      // 处理错误
      this.recognizer.canceled = (s, e) => {
        console.error("❌ 语音识别被取消:", {
          reason: SpeechSDK.CancellationReason[e.reason],
          errorCode: e.errorCode,
          errorDetails: e.errorDetails,
        });
        onError(e.errorDetails || "语音识别被取消");
        this.isListening = false;
      };

      // 处理会话开始
      this.recognizer.sessionStarted = (s, e) => {
        // console.log("🎯 语音识别会话开始:", e.sessionId);
      };

      // 处理会话结束
      this.recognizer.sessionStopped = (s, e) => {
        // console.log("🏁 语音识别会话结束:", e.sessionId);
        onEnd();
        this.isListening = false;
      };

      // 开始连续识别
      // console.log("▶️ 启动连续语音识别...");
      this.recognizer.startContinuousRecognitionAsync(
        () => {
          // console.log("✅ Azure 语音识别已启动");
          this.isListening = true;
        },
        (error) => {
          console.error("❌ 启动 Azure 语音识别失败:", error);
          onError(typeof error === "string" ? error : "Azure 语音识别启动失败");
          this.isListening = false;
        },
      );
    } catch (error) {
      console.error("❌ 创建语音识别器失败:", error);
      onError(typeof error === "string" ? error : "语音识别器创建失败");
    }
  }

  // 停止语音识别
  public stopRecognition(): void {
    if (this.recognizer && this.isListening) {
      console.log("⏹️ 停止语音识别...");

      this.recognizer.stopContinuousRecognitionAsync(
        () => {
          console.log("✅ Azure 语音识别已停止");
          this.isListening = false;
        },
        (error) => {
          console.error("❌ 停止 Azure 语音识别失败:", error);
          this.isListening = false;
        },
      );
    } else if (this.recognizer) {
      // 即使没有在监听，也确保识别器处于停止状态
      console.log("🔄 确保识别器处于停止状态...");
      this.isListening = false;
    }
  }

  // 释放资源
  public dispose(): void {
    console.log("🗑️ 开始释放 Azure Speech 资源...");

    try {
      // 1. 首先确保停止所有识别活动
      this.stopRecognition();

      // 2. 强制等待停止完成（使用简单的延迟确保异步操作完成）
      setTimeout(() => {
        try {
          // 3. 彻底清理识别器
          if (this.recognizer) {
            console.log("🔧 清理语音识别器...");

            // 关闭识别器（Azure Speech SDK会自动清理事件监听器）
            this.recognizer.close();
            this.recognizer = null;
            console.log("✅ 语音识别器已清理");
          }

          // 4. 清理音频配置
          if (this.audioConfig) {
            console.log("🔧 清理音频配置...");
            this.audioConfig.close();
            this.audioConfig = null;
            console.log("✅ 音频配置已清理");
          }

          // 5. 清理语音配置
          if (this.speechConfig) {
            console.log("🔧 清理语音配置...");
            this.speechConfig = null;
            console.log("✅ 语音配置已清理");
          }

          // 6. 重置状态标志
          this.isListening = false;

          // 7. 清理配置对象引用
          this.config = null as any;

          console.log("✅ Azure Speech 资源释放完成");
        } catch (error) {
          console.error("❌ 资源清理过程中发生错误:", error);
        }
      }, 100); // 给异步停止操作留出时间
    } catch (error) {
      console.error("❌ dispose 过程中发生错误:", error);

      // 即使出错也要确保清理基本资源
      this.recognizer = null;
      this.audioConfig = null;
      this.speechConfig = null;
      this.isListening = false;
      this.config = null as any;
    }
  }

  // 检查是否正在监听
  public getIsListening(): boolean {
    return this.isListening;
  }
}

// 异步验证密钥有效性的独立函数
async function validateKeyAsync(key: string, region: string): Promise<void> {
  try {
    const response = await fetch(
      `/api/azure?key=${encodeURIComponent(key)}&region=${encodeURIComponent(
        region,
      )}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const result = await response.json();

    if (!result.success) {
      const removeResponse = await fetch(
        `/api/azure/config?key=${encodeURIComponent(
          key,
        )}&region=${encodeURIComponent(region)}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (removeResponse.ok) {
        console.log("🗑️ 已移除无效的密钥对");
      }
    }
  } catch (error) {
    console.error(`❌ 密钥验证过程出错:`, error);
  }
}

// 获取下一个可用的 Azure Speech Key 和 Region (异步验证版本)
export async function getNextAvailableKey(): Promise<AzureSpeechConfig> {
  // 通过 API 获取环境配置
  const response = await fetch("/api/azure/config", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`获取 Azure 配置失败: ${response.status}`);
  }

  const configResult = await response.json();

  if (!configResult.success) {
    throw new Error(`Azure 配置错误: ${configResult.error}`);
  }

  const envConfig = configResult.data;
  const language = localStorage.getItem("interviewLanguage") || "auto-detect"; // 默认中英混合

  // 🛡️ 边界检查
  if (!envConfig.key || envConfig.key.length === 0) {
    throw new Error("Azure Speech Keys 配置为空");
  }

  const selectedKey = envConfig.key[index] || envConfig.key[0];
  const selectedRegion = envConfig.region[index] || envConfig.region[0];

  index = (index + 1) % envConfig.key.length;

  // 🚀 先返回配置，然后异步验证密钥有效性
  const config: AzureSpeechConfig = {
    subscriptionKey: selectedKey,
    region: selectedRegion,
    language,
  };

  // 🔍 在后台异步验证密钥（不阻塞返回）
  validateKeyAsync(selectedKey, selectedRegion).catch((error) => {
    console.warn("⚠️ 后台密钥验证失败:", error);
  });

  return config;
}

// 工具函数：从环境变量获取 Azure 配置 (异步版本)
export async function getAzureSpeechConfig(): Promise<AzureSpeechConfig> {
  return await getNextAvailableKey();
}

// 检查 Azure Speech SDK 是否可用 (异步版本)
export async function isAzureSpeechAvailable(): Promise<boolean> {
  try {
    const hasSDK = typeof SpeechSDK !== "undefined";
    const hasWindow = typeof window !== "undefined";

    // 通过 API 检查配置可用性
    let hasConfig = false;
    try {
      const response = await fetch("/api/azure/config", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        hasConfig = result.success;
      }
    } catch (configError) {
      console.warn("⚠️ 检查配置时出错:", configError);
      hasConfig = false;
    }

    console.log("🔍 检查 Azure Speech 可用性:", {
      hasSDK,
      hasWindow,
      hasConfig,
      available: hasSDK && hasWindow && hasConfig,
    });

    return hasSDK && hasWindow && hasConfig;
  } catch (error) {
    console.error("❌ Azure Speech 不可用:", error);
    return false;
  }
}
