import * as tf from "@tensorflow/tfjs";
import { voiceprintStorage } from "./voiceprint-storage";

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
  matchThreshold: 0.6,
  cooldownPeriod: 1500,
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

    // 预加重滤波 - 增强高频信号 (y[n] = x[n] - α * x[n-1], α通常为0.95)
    const preEmphasisCoeff = 0.95;
    const preEmphasisData = new Float32Array(mergedData.length);
    preEmphasisData[0] = mergedData[0];
    for (let i = 1; i < mergedData.length; i++) {
      preEmphasisData[i] = mergedData[i] - preEmphasisCoeff * mergedData[i - 1];
    }

    // 转换为张量
    const audioTensor = tf.tensor1d(preEmphasisData);

    // 帧分割参数
    const frameLength = Math.round((SAMPLE_RATE * FRAME_LENGTH) / 1000);
    const frameStep = Math.round((SAMPLE_RATE * FRAME_STEP) / 1000);

    // 创建Hamming窗口
    const hammingWindow = new Float32Array(frameLength);
    for (let i = 0; i < frameLength; i++) {
      hammingWindow[i] =
        0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameLength - 1));
    }

    // 帧分割并应用Hamming窗口
    const frames = [];
    for (let i = 0; i + frameLength <= preEmphasisData.length; i += frameStep) {
      const frame = new Float32Array(frameLength);
      const originalFrame = preEmphasisData.slice(i, i + frameLength);

      // 应用窗口函数
      for (let j = 0; j < frameLength; j++) {
        frame[j] = originalFrame[j] * hammingWindow[j];
      }

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

    // 改进的梅尔频谱计算
    const melSpectrogram = tf.tidy(() => {
      // 对每帧应用FFT并计算功率谱
      // 在TensorFlow.js中没有直接的FFT实现，使用abs作为简化的频谱幅度
      const fftMag = featureTensor.abs();

      // 计算功率谱 (幅度平方)
      const powerSpectrum = fftMag.square();

      // 降维到MEL_BINS (简化的梅尔滤波器实现)
      const reshaped = powerSpectrum.reshape([FEATURE_LENGTH, -1]);
      const melFeatures = reshaped.slice([0, 0], [FEATURE_LENGTH, MEL_BINS]);

      // 应用对数变换 (log(melFeatures + 小的常数)防止对0取对数)
      const logMelFeatures = tf.log(tf.add(melFeatures, tf.scalar(1e-6)));

      // 特征归一化: 减均值除标准差
      const mean = tf.mean(logMelFeatures);
      const std = tf.sqrt(tf.mean(tf.square(tf.sub(logMelFeatures, mean))));
      const normalized = tf.div(
        tf.sub(logMelFeatures, mean),
        tf.add(std, tf.scalar(1e-6)),
      );

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

      // 归一化保存的声纹向量
      const normalizedSavedVoiceprint = tf.div(
        savedVoiceprintTensor,
        tf.norm(savedVoiceprintTensor),
      );

      // 计算归一化向量间的点积 (余弦相似度)
      // 两个单位向量的点积等于余弦相似度
      const dotProduct = tf.sum(
        tf.mul(currentVoiceprint.reshape([-1]), normalizedSavedVoiceprint),
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

/**
 * 声纹识别模型加载结果
 */
export interface VoiceprintModelLoadResult {
  model: tf.LayersModel;
  voiceprint: Float32Array | null;
  recognizer: RealtimeVoiceprintRecognizer | null;
}

/**
 * 加载声纹识别模型和识别器
 *
 * 从IndexedDB加载保存的声纹特征，创建并初始化TensorFlow模型，
 * 以及初始化实时声纹识别器。
 *
 * @param onStatusChange 状态变化回调函数
 * @param onVoiceprintEnabled 声纹功能启用状态回调函数
 * @param onVoiceprintResult 声纹识别结果回调函数
 * @returns 包含模型、声纹和识别器的对象
 */
export const loadVoiceprintModelAndRecognizer = async (
  onStatusChange: (status: VoiceRecognitionStatus) => void,
  onVoiceprintEnabled: (enabled: boolean) => void,
  onVoiceprintResult: (result: { isMatch: boolean; score: number }) => void,
): Promise<VoiceprintModelLoadResult> => {
  let voiceprint: Float32Array | null = null;
  let model: tf.LayersModel | null = null;
  let recognizer: RealtimeVoiceprintRecognizer | null = null;

  try {
    // 尝试从IndexedDB加载保存的声纹
    voiceprint = await voiceprintStorage.getVoiceprint();
    if (voiceprint) {
      console.log("已加载保存的声纹模型");
    } else {
      console.log("未找到保存的声纹模型，请先在TensorFlow页面训练声纹");
      onVoiceprintEnabled(false);
    }

    // 尝试从IndexedDB加载模型
    model = await voiceprintStorage.loadModel();

    // 如果没有从IndexedDB加载到模型，创建新模型
    if (!model) {
      console.log("创建新的声纹识别模型");
      const sequentialModel = tf.sequential();
      sequentialModel.add(
        tf.layers.conv1d({
          inputShape: [FEATURE_LENGTH, MEL_BINS],
          filters: 32,
          kernelSize: 3,
          activation: "relu",
        }),
      );
      sequentialModel.add(tf.layers.maxPooling1d({ poolSize: 2 }));
      sequentialModel.add(
        tf.layers.conv1d({
          filters: 64,
          kernelSize: 3,
          activation: "relu",
        }),
      );
      sequentialModel.add(tf.layers.maxPooling1d({ poolSize: 2 }));
      sequentialModel.add(tf.layers.flatten());
      sequentialModel.add(tf.layers.dense({ units: 128, activation: "relu" }));
      sequentialModel.add(tf.layers.dropout({ rate: 0.5 }));
      sequentialModel.add(tf.layers.dense({ units: 64, activation: "linear" }));
      sequentialModel.compile({
        optimizer: "adam",
        loss: "meanSquaredError",
      });

      // 将Sequential模型赋值给通用的LayersModel引用
      model = sequentialModel;
    }

    // 如果有声纹和训练样本，尝试进行模型校准
    if (voiceprint) {
      const trainingSamples = await voiceprintStorage.getTrainingSamples();
      if (trainingSamples && trainingSamples.length > 0) {
        console.log("使用缓存的训练样本校准模型");
        try {
          const features = await extractFeatures(trainingSamples);
          if (features) {
            // 仅做前向传播让模型预热，不更新权重
            tf.tidy(() => {
              model!.predict(features);
            });
            features.dispose();
          }
        } catch (calibrateError) {
          console.warn("模型校准失败，继续使用未校准模型:", calibrateError);
        }
      }
    }

    // 初始化实时识别器
    if (model && voiceprint) {
      // 创建实时识别器实例
      recognizer = new RealtimeVoiceprintRecognizer(
        model,
        DEFAULT_VOICEPRINT_CONFIG,
        onVoiceprintResult,
      );

      // 设置声纹特征
      recognizer.setVoiceprint(voiceprint);
      onStatusChange(VoiceRecognitionStatus.TRAINED);
      onVoiceprintEnabled(true);
    }
  } catch (error) {
    console.error("加载模型或声纹失败:", error);
    onStatusChange(VoiceRecognitionStatus.ERROR);
    onVoiceprintEnabled(false);
  }

  return {
    model: model as tf.LayersModel,
    voiceprint,
    recognizer,
  };
};

/**
 * 保存模型到IndexedDB
 * @param model 要保存的模型
 * @returns 是否保存成功
 */
export const saveModelToCache = async (
  model: tf.LayersModel,
): Promise<boolean> => {
  return voiceprintStorage.saveModel(model);
};

/**
 * 保存训练样本到IndexedDB
 * @param audioData 训练音频样本
 * @returns 是否保存成功
 */
export const saveTrainingSamplesToCache = async (
  audioData: Float32Array[],
): Promise<boolean> => {
  return voiceprintStorage.saveTrainingSamples(audioData);
};

/**
 * 保存声纹数据到IndexedDB
 * @param voiceprint 声纹数据
 * @returns 是否保存成功
 */
export const saveVoiceprintToStorage = async (
  voiceprint: Float32Array,
): Promise<boolean> => {
  return voiceprintStorage.saveVoiceprint(voiceprint);
};

/**
 * 从IndexedDB加载声纹数据
 * @returns 声纹数据或null
 */
export const loadVoiceprintFromStorage =
  async (): Promise<Float32Array | null> => {
    return voiceprintStorage.getVoiceprint();
  };

/**
 * 删除所有缓存的模型和训练数据
 */
export const clearModelCache = async (): Promise<void> => {
  await voiceprintStorage.clearAll();
};
