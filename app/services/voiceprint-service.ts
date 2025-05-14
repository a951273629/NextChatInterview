import * as tf from "@tensorflow/tfjs";

// 声纹特征提取参数
export const SAMPLE_RATE = 16000; // 采样率
export const FFT_SIZE = 1024; // FFT大小
export const MEL_BINS = 40; // Mel滤波器数量
export const FRAME_LENGTH = 25; // 帧长度(ms)
export const FRAME_STEP = 10; // 帧步长(ms)
export const FEATURE_LENGTH = 100; // 特征序列长度

// 声纹识别状态
export enum VoiceRecognitionStatus {
  IDLE = "空闲",
  RECORDING = "录制中",
  TRAINING = "训练中",
  RECOGNIZING = "识别中",
  TRAINED = "已训练",
  MATCHED = "声纹匹配",
  NOT_MATCHED = "声纹不匹配",
  ERROR = "错误",
}

// 声纹识别阈值和冷却时间配置
export interface VoiceprintConfig {
  // 声纹匹配阈值 (0-1之间，越高要求越严格)
  matchThreshold: number;
  // 识别冷却时间(ms)，防止频繁触发识别结果变化
  cooldownPeriod: number;
  // 滑动窗口大小(ms)
  slidingWindowSize: number;
  // 滑动窗口步进(ms)
  slidingWindowStep: number;
}

// 默认配置
export const DEFAULT_VOICEPRINT_CONFIG: VoiceprintConfig = {
  matchThreshold: 0.7,
  cooldownPeriod: 2000,
  slidingWindowSize: 3000,
  slidingWindowStep: 1000,
};

/**
 * 提取音频特征
 * @param audioData 音频数据数组
 * @returns 特征张量或null（如果提取失败）
 */
export const extractFeatures = async (
  audioData: Float32Array[],
): Promise<tf.Tensor | null> => {
  try {
    // 合并所有音频块
    const mergedData = new Float32Array(
      audioData.reduce((acc, chunk) => acc + chunk.length, 0),
    );
    let offset = 0;
    for (const chunk of audioData) {
      mergedData.set(chunk, offset);
      offset += chunk.length;
    }

    // 转换为张量
    const audioTensor = tf.tensor1d(mergedData);

    // 计算梅尔频谱图 (简化版)
    const frameLength = Math.round((SAMPLE_RATE * FRAME_LENGTH) / 1000);
    const frameStep = Math.round((SAMPLE_RATE * FRAME_STEP) / 1000);

    // 使用短时傅里叶变换提取特征
    const frames = [];
    for (let i = 0; i + frameLength <= mergedData.length; i += frameStep) {
      const frame = mergedData.slice(i, i + frameLength);
      frames.push(Array.from(frame));
    }

    // 限制帧数
    const limitedFrames = frames.slice(0, FEATURE_LENGTH);

    // 如果帧数不足，用零填充
    while (limitedFrames.length < FEATURE_LENGTH) {
      limitedFrames.push(new Array(frameLength).fill(0));
    }

    // 创建特征张量
    const featureTensor = tf.tensor(limitedFrames);

    // 简化的梅尔频谱计算
    const melSpectrogram = tf.tidy(() => {
      // 应用FFT (简化)
      const fftMag = featureTensor.abs();

      // 降维到MEL_BINS
      const reshaped = fftMag.reshape([FEATURE_LENGTH, -1]);
      const melFeatures = reshaped.slice([0, 0], [FEATURE_LENGTH, MEL_BINS]);

      // 归一化
      const normalized = melFeatures.div(tf.scalar(255.0));

      return normalized.expandDims(0); // 添加批次维度
    });

    return melSpectrogram;
  } catch (error) {
    console.error("特征提取失败:", error);
    return null;
  }
};

/**
 * 识别声纹
 * @param audioData 录音数据
 * @param model TensorFlow模型
 * @param savedVoiceprint 已保存的声纹特征
 * @param config 声纹识别配置
 * @returns 识别结果，包含匹配状态和相似度分数
 */
export const recognizeVoice = async (
  audioData: Float32Array[],
  model: tf.LayersModel,
  savedVoiceprint: Float32Array,
  config: VoiceprintConfig = DEFAULT_VOICEPRINT_CONFIG,
): Promise<{ isMatch: boolean; score: number }> => {
  try {
    // 提取特征
    const features = await extractFeatures(audioData);
    if (!features) throw new Error("特征提取失败");

    // 使用模型提取声纹特征向量
    const currentVoiceprint = tf.tidy(() => {
      // 前向传播获取声纹特征
      const prediction = model.predict(features) as tf.Tensor;
      // 归一化特征向量
      return tf.div(prediction, tf.norm(prediction));
    });

    // 计算与保存的声纹的余弦相似度
    const similarity = tf.tidy(() => {
      const savedVoiceprintTensor = tf.tensor1d(savedVoiceprint);
      // 计算点积
      const dotProduct = tf.sum(
        tf.mul(currentVoiceprint.reshape([-1]), savedVoiceprintTensor),
      );
      return dotProduct;
    });

    // 获取相似度分数 (范围从-1到1，越接近1表示越相似)
    const similarityScore = await similarity.data();
    const score = similarityScore[0];

    // 判断是否为同一人
    const isMatch = score > config.matchThreshold;

    // 清理
    currentVoiceprint.dispose();
    features.dispose();
    similarity.dispose();

    return { isMatch, score };
  } catch (error) {
    console.error("识别失败:", error);
    throw new Error("声纹识别失败");
  }
};

/**
 * 实时声纹识别类
 * 使用滑动窗口分析连续音频流
 */
export class RealtimeVoiceprintRecognizer {
  private model: tf.LayersModel;
  private savedVoiceprint: Float32Array | null = null;
  private config: VoiceprintConfig;
  private audioBuffer: Float32Array[] = [];
  private lastRecognitionTime: number = 0;
  private onResultCallback: (result: {
    isMatch: boolean;
    score: number;
  }) => void;
  private bufferDuration: number = 0;
  private isProcessing: boolean = false;

  /**
   * 创建实时声纹识别器
   * @param model TensorFlow模型
   * @param config 识别配置
   * @param onResult 识别结果回调函数
   */
  constructor(
    model: tf.LayersModel,
    config: VoiceprintConfig = DEFAULT_VOICEPRINT_CONFIG,
    onResult: (result: { isMatch: boolean; score: number }) => void,
  ) {
    this.model = model;
    this.config = config;
    this.onResultCallback = onResult;
  }

  /**
   * 设置保存的声纹特征
   * @param voiceprint 声纹特征
   */
  setVoiceprint(voiceprint: Float32Array | null): void {
    this.savedVoiceprint = voiceprint;
  }

  /**
   * 获取保存的声纹特征
   */
  getVoiceprint(): Float32Array | null {
    return this.savedVoiceprint;
  }

  /**
   * 添加音频数据到缓冲区
   * @param audioChunk 音频数据块
   */
  addAudioData(audioChunk: Float32Array) {
    // 添加到缓冲区
    this.audioBuffer.push(new Float32Array(audioChunk));

    // 估算当前缓冲区时长(ms)
    this.bufferDuration += (audioChunk.length / SAMPLE_RATE) * 1000;

    // 当缓冲区足够长且未在处理中时尝试识别
    if (
      this.bufferDuration >= this.config.slidingWindowSize &&
      !this.isProcessing &&
      this.savedVoiceprint
    ) {
      this.processAudioWindow();
    }

    // 如果缓冲区过长，移除旧数据
    while (this.bufferDuration > this.config.slidingWindowSize * 2) {
      const oldestChunk = this.audioBuffer.shift();
      if (oldestChunk) {
        this.bufferDuration -= (oldestChunk.length / SAMPLE_RATE) * 1000;
      }
    }
  }

  /**
   * 处理音频窗口
   */
  private async processAudioWindow() {
    // 防止并发处理
    if (this.isProcessing || !this.savedVoiceprint) return;

    // 添加模型有效性检查
    if (!this.model || (this.model as any).__disposed) {
      console.log("模型已不可用，跳过处理");
      return;
    }

    const now = Date.now();
    // 检查冷却期
    if (now - this.lastRecognitionTime < this.config.cooldownPeriod) return;

    this.isProcessing = true;

    try {
      // 计算当前滑动窗口中的数据
      const windowData = this.getWindowData();

      // 执行识别
      const result = await recognizeVoice(
        windowData,
        this.model,
        this.savedVoiceprint,
        this.config,
      );

      // 更新上次识别时间
      this.lastRecognitionTime = now;

      // 回调结果
      this.onResultCallback(result);
    } catch (error) {
      console.error("实时声纹识别失败:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 获取当前窗口的音频数据
   * @returns 窗口内的音频数据数组
   */
  private getWindowData(): Float32Array[] {
    // 计算需要的音频数据长度
    const windowSizeSamples = Math.floor(
      (this.config.slidingWindowSize / 1000) * SAMPLE_RATE,
    );

    // 从缓冲区末尾选择满足窗口大小的数据
    let samplesCollected = 0;
    const windowChunks: Float32Array[] = [];

    for (let i = this.audioBuffer.length - 1; i >= 0; i--) {
      const chunk = this.audioBuffer[i];
      windowChunks.unshift(chunk);

      samplesCollected += chunk.length;
      if (samplesCollected >= windowSizeSamples) break;
    }

    return windowChunks;
  }

  /**
   * 清空音频缓冲区
   */
  clearBuffer() {
    this.audioBuffer = [];
    this.bufferDuration = 0;
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: Partial<VoiceprintConfig>) {
    this.config = { ...this.config, ...config };
  }
}
