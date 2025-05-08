/**
 * 音频处理器模块
 * 负责音频数据的采集、增强和特征提取
 */

import * as tf from "@tensorflow/tfjs";
import { AUDIO_CONFIG, AUDIO_ENHANCEMENT_CONFIG } from "./types";

/**
 * 音频处理器类
 * 提供音频数据处理、增强和特征提取功能
 */
export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private recordedChunks: Float32Array[] = [];
  private animationFrameId: number | null = null;
  private onFrequenciesUpdate: ((frequencies: Uint8Array) => void) | null =
    null;

  /**
   * 构造函数
   * @param onFrequenciesUpdate 频率数据更新回调函数
   */
  constructor(onFrequenciesUpdate?: (frequencies: Uint8Array) => void) {
    this.onFrequenciesUpdate = onFrequenciesUpdate || null;
  }

  /**
   * 开始录音
   * @returns 返回Promise，成功时返回true，失败时抛出错误
   */
  public async startRecording(): Promise<boolean> {
    try {
      // 重置录音数据
      this.recordedChunks = [];

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;

      // 创建音频上下文
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.audioContext = audioContext;

      // 创建分析器节点用于可视化
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = AUDIO_CONFIG.FFT_SIZE;
      this.analyser = analyser;

      // 创建音频源
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // 创建处理器节点
      const processor = audioContext.createScriptProcessor(
        AUDIO_CONFIG.PROCESSOR_BUFFER_SIZE,
        1,
        1,
      );
      this.processor = processor;

      // 处理音频数据
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // 应用音频增强
        const enhancedData = this.enhanceAudio(inputData);
        this.recordedChunks.push(enhancedData);
      };

      // 连接节点
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      // 开始频谱可视化
      if (this.onFrequenciesUpdate) {
        this.startVisualization();
      }

      return true;
    } catch (error) {
      console.error("开始录音失败:", error);
      throw error;
    }
  }

  /**
   * 停止录音
   */
  public stopRecording(): void {
    // 停止所有音频流
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // 关闭音频上下文
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // 停止可视化
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // 清理处理器
    this.processor = null;
    this.analyser = null;
  }

  /**
   * 获取录制的音频数据
   * @returns 录制的音频数据数组
   */
  public getRecordedChunks(): Float32Array[] {
    return this.recordedChunks;
  }

  /**
   * 清除录制的音频数据
   */
  public clearRecordedChunks(): void {
    this.recordedChunks = [];
  }

  /**
   * 开始频谱可视化
   */
  private startVisualization(): void {
    const analyser = this.analyser;
    if (!analyser || !this.onFrequenciesUpdate) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateVisualization = () => {
      if (!analyser || !this.onFrequenciesUpdate) return;

      analyser.getByteFrequencyData(dataArray);
      this.onFrequenciesUpdate(dataArray);

      this.animationFrameId = requestAnimationFrame(updateVisualization);
    };

    updateVisualization();
  }

  /**
   * 音频增强处理
   * 应用噪声抑制、信号归一化和增益控制
   * @param audioData 原始音频数据
   * @returns 增强后的音频数据
   */
  private enhanceAudio(audioData: Float32Array): Float32Array {
    // 创建新的数组以避免修改原始数据
    const enhancedData = new Float32Array(audioData.length);

    // 复制原始数据
    audioData.forEach((sample, i) => {
      enhancedData[i] = sample;
    });

    // 应用噪声抑制
    if (AUDIO_ENHANCEMENT_CONFIG.NOISE_SUPPRESSION) {
      for (let i = 0; i < enhancedData.length; i++) {
        // 简单的噪声门控：低于阈值的信号视为噪声，将其减弱
        if (
          Math.abs(enhancedData[i]) < AUDIO_ENHANCEMENT_CONFIG.NOISE_THRESHOLD
        ) {
          enhancedData[i] *= 0.1; // 减弱噪声
        }
      }
    }

    // 应用增益控制
    if (AUDIO_ENHANCEMENT_CONFIG.GAIN !== 1.0) {
      for (let i = 0; i < enhancedData.length; i++) {
        enhancedData[i] *= AUDIO_ENHANCEMENT_CONFIG.GAIN;
      }
    }

    // 应用信号归一化
    if (AUDIO_ENHANCEMENT_CONFIG.NORMALIZE) {
      // 找出最大振幅
      let maxAmplitude = 0;
      for (let i = 0; i < enhancedData.length; i++) {
        maxAmplitude = Math.max(maxAmplitude, Math.abs(enhancedData[i]));
      }

      // 如果最大振幅大于0，则归一化信号
      if (maxAmplitude > 0) {
        const normalizationFactor = 0.9 / maxAmplitude; // 保留一些余量，避免削波
        for (let i = 0; i < enhancedData.length; i++) {
          enhancedData[i] *= normalizationFactor;
        }
      }
    }

    return enhancedData;
  }

  /**
   * 提取音频特征
   * 使用TensorFlow.js进行特征提取，返回梅尔频谱图特征
   * @param audioData 音频数据数组
   * @returns 提取的特征张量，如果失败则返回null
   */
  public async extractFeatures(
    audioData: Float32Array[],
  ): Promise<tf.Tensor | null> {
    try {
      // 使用Web Worker异步处理特征提取（如果浏览器支持）
      if (typeof Worker !== "undefined" && window.OffscreenCanvas) {
        return await this.extractFeaturesAsync(audioData);
      } else {
        // 回退到同步处理
        return this.extractFeaturesSync(audioData);
      }
    } catch (error) {
      console.error("特征提取失败:", error);
      return null;
    }
  }

  /**
   * 同步提取音频特征
   * @param audioData 音频数据数组
   * @returns 提取的特征张量
   */
  private extractFeaturesSync(audioData: Float32Array[]): tf.Tensor | null {
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

      // 计算梅尔频谱图
      const frameLength = Math.round(
        (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.FRAME_LENGTH) / 1000,
      );
      const frameStep = Math.round(
        (AUDIO_CONFIG.SAMPLE_RATE * AUDIO_CONFIG.FRAME_STEP) / 1000,
      );

      // 使用短时傅里叶变换提取特征
      const frames = [];
      for (let i = 0; i + frameLength <= mergedData.length; i += frameStep) {
        const frame = mergedData.slice(i, i + frameLength);
        frames.push(Array.from(frame));
      }

      // 限制帧数
      const limitedFrames = frames.slice(0, AUDIO_CONFIG.FEATURE_LENGTH);

      // 如果帧数不足，用零填充
      while (limitedFrames.length < AUDIO_CONFIG.FEATURE_LENGTH) {
        limitedFrames.push(new Array(frameLength).fill(0));
      }

      // 创建特征张量
      const featureTensor = tf.tensor(limitedFrames);

      // 计算梅尔频谱图
      const melSpectrogram = tf.tidy(() => {
        // 应用FFT
        const fftMag = featureTensor.abs();

        // 降维到MEL_BINS
        const reshaped = fftMag.reshape([AUDIO_CONFIG.FEATURE_LENGTH, -1]);
        const melFeatures = reshaped.slice(
          [0, 0],
          [AUDIO_CONFIG.FEATURE_LENGTH, AUDIO_CONFIG.MEL_BINS],
        );

        // 归一化
        const normalized = melFeatures.div(tf.scalar(255.0));

        return normalized.expandDims(0); // 添加批次维度
      });

      // 清理临时张量
      audioTensor.dispose();
      featureTensor.dispose();

      return melSpectrogram;
    } catch (error) {
      console.error("同步特征提取失败:", error);
      return null;
    }
  }

  /**
   * 异步提取音频特征（使用Web Worker）
   * 注意：这是一个简化的实现，实际项目中应创建真正的Web Worker文件
   * @param audioData 音频数据数组
   * @returns Promise，成功时返回特征张量
   */
  private async extractFeaturesAsync(
    audioData: Float32Array[],
  ): Promise<tf.Tensor | null> {
    // 由于Web Worker实现较复杂，这里仍使用同步方法
    // 在实际项目中，应创建专门的Worker文件处理特征提取
    console.log("使用异步特征提取（模拟）");
    return this.extractFeaturesSync(audioData);
  }
}
