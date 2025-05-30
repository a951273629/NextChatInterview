import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";

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

// 简化的 Azure Speech 识别器类
export class AzureSpeechRecognizer {
  private speechConfig: SpeechSDK.SpeechConfig | null = null;
  private recognizer: SpeechSDK.SpeechRecognizer | null = null;
  private audioConfig: SpeechSDK.AudioConfig | null = null;
  private isListening: boolean = false;

  constructor(config: AzureSpeechConfig) {
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
      this.speechConfig.speechRecognitionLanguage = config.language;

      // 设置识别模式为连续识别
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
        "5000",
      );
      this.speechConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
        "1000",
      );

      console.log("✅ Azure Speech 配置初始化成功");
    } catch (error) {
      console.error("❌ 初始化 Azure Speech 配置失败:", error);
      throw error;
    }
  }

  // 简化版：直接从 MediaStream 创建音频配置
  public createAudioConfigFromStream(mediaStream: MediaStream): void {
    try {
      console.log("🎵 开始创建音频配置...");
      console.log("📡 MediaStream 信息:", {
        active: mediaStream.active,
        audioTracks: mediaStream.getAudioTracks().length,
        videoTracks: mediaStream.getVideoTracks().length,
      });

      // 1. 提取音频轨道
      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error("MediaStream 中没有音频轨道");
      }

      const audioTrack = audioTracks[0];
      console.log("🎤 音频轨道信息:", {
        kind: audioTrack.kind,
        label: audioTrack.label,
        enabled: audioTrack.enabled,
        readyState: audioTrack.readyState,
        settings: audioTrack.getSettings(),
      });

      // 2. 创建纯音频 MediaStream
      const audioOnlyStream = new MediaStream([audioTrack]);
      console.log("🎧 创建纯音频流:", {
        active: audioOnlyStream.active,
        audioTracks: audioOnlyStream.getAudioTracks().length,
      });

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
      console.log("🚀 开始创建语音识别器...");

      // 创建语音识别器
      this.recognizer = new SpeechSDK.SpeechRecognizer(
        this.speechConfig,
        this.audioConfig,
      );

      // 处理识别中的结果（部分结果）
      this.recognizer.recognizing = (s, e) => {
        if (e.result && e.result.text) {
          console.log("🔄 识别中:", e.result.text);
          onResult(e.result.text, false);
        }
      };

      // 处理识别完成的结果（最终结果）
      this.recognizer.recognized = (s, e) => {
        if (e.result && e.result.text) {
          console.log("✅ 最终识别结果:", e.result.text);
          onResult(e.result.text, true);
        } else {
          console.log("ℹ️ 识别结果为空或无效:", e.result);
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
        console.log("🎯 语音识别会话开始:", e.sessionId);
      };

      // 处理会话结束
      this.recognizer.sessionStopped = (s, e) => {
        console.log("🏁 语音识别会话结束:", e.sessionId);
        onEnd();
        this.isListening = false;
      };

      // 开始连续识别
      console.log("▶️ 启动连续语音识别...");
      this.recognizer.startContinuousRecognitionAsync(
        () => {
          console.log("✅ Azure 语音识别已启动");
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
    }
  }

  // 释放资源
  public dispose(): void {
    console.log("🗑️ 释放 Azure Speech 资源...");
    this.stopRecognition();

    if (this.recognizer) {
      this.recognizer.close();
      this.recognizer = null;
    }

    if (this.audioConfig) {
      this.audioConfig.close();
      this.audioConfig = null;
    }

    this.speechConfig = null;
    console.log("✅ 资源释放完成");
  }

  // 检查是否正在监听
  public getIsListening(): boolean {
    return this.isListening;
  }
}

// 工具函数：从环境变量获取 Azure 配置
export function getAzureSpeechConfig(): AzureSpeechConfig {
  const subscriptionKey = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY || "";
  const region = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION || "";
  const language = "zh-CN"; // 默认中文

  console.log("🔧 获取 Azure Speech 配置:", {
    hasKey: !!subscriptionKey,
    keyPrefix: subscriptionKey
      ? subscriptionKey.substring(0, 8) + "..."
      : "未设置",
    region: region || "未设置",
    language,
  });

  if (!subscriptionKey || !region) {
    const errorMsg =
      "Azure Speech 配置缺失。请设置 NEXT_PUBLIC_AZURE_SPEECH_KEY 和 NEXT_PUBLIC_AZURE_SPEECH_REGION 环境变量。";
    console.error("❌", errorMsg);
    throw new Error(errorMsg);
  }

  return {
    subscriptionKey,
    region,
    language,
  };
}

// 检查 Azure Speech SDK 是否可用
export function isAzureSpeechAvailable(): boolean {
  try {
    const hasSDK = typeof SpeechSDK !== "undefined";
    const hasWindow = typeof window !== "undefined";
    const hasConfig = !!getAzureSpeechConfig();

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
