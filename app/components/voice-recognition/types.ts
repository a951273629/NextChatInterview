/**
 * 声纹识别模块类型定义
 */

// 声纹识别状态枚举
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

// 录音模式枚举
export enum RecordingMode {
  NONE = "无录音",
  TRAINING = "训练录音",
  RECOGNITION = "识别录音",
}

// 声纹特征提取参数
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000, // 采样率
  FFT_SIZE: 1024, // FFT大小
  MEL_BINS: 40, // Mel滤波器数量
  FRAME_LENGTH: 25, // 帧长度(ms)
  FRAME_STEP: 10, // 帧步长(ms)
  FEATURE_LENGTH: 100, // 特征序列长度
  PROCESSOR_BUFFER_SIZE: 4096, // 音频处理缓冲区大小
  TRAINING_DURATION: 10000, // 训练录音持续时间(ms)
};

// 音频增强配置
export const AUDIO_ENHANCEMENT_CONFIG = {
  NOISE_SUPPRESSION: true, // 噪声抑制
  NOISE_THRESHOLD: 0.05, // 噪声阈值
  GAIN: 1.2, // 增益
  NORMALIZE: true, // 信号归一化
};

// 声纹识别结果接口
export interface VoiceRecognitionResult {
  isMatch: boolean; // 是否匹配
  score: number; // 匹配分数
  threshold: number; // 匹配阈值
}

// 声纹识别状态接口
export interface VoiceRecognitionState {
  status: VoiceRecognitionStatus; // 当前状态
  message: string; // 状态消息
  recordingMode: RecordingMode; // 录音模式
  isTrained: boolean; // 是否已训练
  matchScore: number; // 匹配分数
  frequencies?: Uint8Array; // 频率数据(用于可视化)
  promptIndex: number; // 训练提示文本索引
}

// 声纹识别回调接口
export interface VoiceRecognitionCallbacks {
  onStatusChange?: (status: VoiceRecognitionStatus) => void;
  onMessageChange?: (message: string) => void;
  onRecordingModeChange?: (mode: RecordingMode) => void;
  onTrainedChange?: (isTrained: boolean) => void;
  onMatchScoreChange?: (score: number) => void;
  onFrequenciesChange?: (frequencies: Uint8Array | undefined) => void;
  onPromptIndexChange?: (index: number) => void;
  onError?: (error: Error) => void;
}
