import React, { useState, useEffect, useRef } from "react";
import * as tf from "@tensorflow/tfjs";
import { VoicePrint } from "./voice-print/voice-print";
import styles from "./TensorFlow.module.scss";
import { trainingPrompts } from "../store/voice-text";
import {
  VoiceRecognitionStatus,
  extractFeatures,
  recognizeVoice,
  RealtimeVoiceprintRecognizer,
  FFT_SIZE,
  loadVoiceprintModelAndRecognizer,
  saveModelToCache,
  saveTrainingSamplesToCache,
  clearModelCache,
} from "../services/voiceprint-service";

// 添加录音模式枚举
enum RecordingMode {
  NONE = "无录音",
  TRAINING = "训练录音",
  RECOGNITION = "识别录音",
  REALTIME = "实时监测",
}

interface TensorFlowProps {
  onVoiceprintResult?: (result: { isMatch: boolean; score: number }) => void;
}

const TensorFlow: React.FC<TensorFlowProps> = ({ onVoiceprintResult }) => {
  // 状态管理
  const [status, setStatus] = useState<VoiceRecognitionStatus>(
    VoiceRecognitionStatus.IDLE,
  );
  const [message, setMessage] = useState<string>("");
  // 替换isRecording为recordingMode
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(
    RecordingMode.NONE,
  );
  const [isTrained, setIsTrained] = useState<boolean>(false);
  const [matchScore, setMatchScore] = useState<number>(0);
  const [frequencies, setFrequencies] = useState<Uint8Array | undefined>(
    undefined,
  );
  // 添加训练提示文本状态
  const [promptIndex, setPromptIndex] = useState<number>(0);
  // 添加倒计时状态
  const [countdown, setCountdown] = useState<number>(15);

  // 引用
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const modelRef = useRef<tf.LayersModel | null>(null);
  const voiceprintRef = useRef<Float32Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  // 添加实时识别器引用
  const realtimeRecognizerRef = useRef<RealtimeVoiceprintRecognizer | null>(
    null,
  );
  // 添加处理器节点引用
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  // 添加倒计时定时器引用
  const countdownTimerRef = useRef<number | null>(null);

  // 初始化
  useEffect(() => {
    // 检查是否有保存的声纹模型
    const savedVoiceprint = localStorage.getItem("userVoiceprint");
    if (savedVoiceprint) {
      try {
        voiceprintRef.current = new Float32Array(JSON.parse(savedVoiceprint));
        setIsTrained(true);
        setStatus(VoiceRecognitionStatus.TRAINED);
        setMessage("已加载保存的声纹模型");
      } catch (error) {
        console.error("加载保存的声纹模型失败:", error);
      }
    }

    // 加载TensorFlow模型
    loadModel();

    return () => {
      stopRecording();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // 加载声纹识别模型
  const loadModel = async () => {
    try {
      // 使用服务中的统一函数加载模型
      const result = await loadVoiceprintModelAndRecognizer(
        // 状态变化回调
        (status) => {
          setStatus(status);
          if (status === VoiceRecognitionStatus.ERROR) {
            setMessage("加载模型失败");
          }
        },
        // 声纹启用状态回调
        (enabled) => {
          setIsTrained(enabled);
        },
        // 结果回调
        (result) => {
          // 回调处理识别结果
          setMatchScore(result.score);
          setStatus(
            result.isMatch
              ? VoiceRecognitionStatus.MATCHED
              : VoiceRecognitionStatus.NOT_MATCHED,
          );

          // 通知父组件
          if (onVoiceprintResult) {
            onVoiceprintResult(result);
          }
        },
      );

      // 保存模型和声纹引用
      modelRef.current = result.model;
      if (result.voiceprint) {
        voiceprintRef.current = result.voiceprint;
      }
      if (result.recognizer) {
        realtimeRecognizerRef.current = result.recognizer;
      }

      console.log("声纹识别模型已加载");
    } catch (error) {
      console.error("加载模型失败:", error);
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("加载模型失败");
    }
  };

  // 开始录音
  const startRecording = async (mode: RecordingMode = RecordingMode.NONE) => {
    try {
      if (recordingMode !== RecordingMode.NONE) return;

      // 重置录音数据
      recordedChunksRef.current = [];

      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // 创建音频上下文
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // 创建分析器节点用于可视化
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyserRef.current = analyser;

      // 创建音频源
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // 创建处理器节点
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // 处理音频数据
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const audioData = new Float32Array(inputData);
        recordedChunksRef.current.push(audioData);

        // 如果是实时监测模式，将数据发送给实时识别器
        if (mode === RecordingMode.REALTIME && realtimeRecognizerRef.current) {
          realtimeRecognizerRef.current.addAudioData(audioData);
        }
      };

      // 连接节点
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      // 更新状态
      setRecordingMode(mode);

      switch (mode) {
        case RecordingMode.TRAINING:
          setStatus(VoiceRecognitionStatus.RECORDING);
          setMessage("请朗读下方提示文本，用于训练声纹模型...");
          // 如果是训练模式，随机选择一个提示文本
          setPromptIndex(Math.floor(Math.random() * trainingPrompts.length));
          // 重置倒计时
          setCountdown(15);
          // 启动倒计时
          countdownTimerRef.current = window.setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                // 时间到，清理定时器
                if (countdownTimerRef.current) {
                  clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                }
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
          break;
        case RecordingMode.RECOGNITION:
          setStatus(VoiceRecognitionStatus.RECOGNIZING);
          setMessage("请说话进行声纹识别...");
          break;
        case RecordingMode.REALTIME:
          setStatus(VoiceRecognitionStatus.RECOGNIZING);
          setMessage("正在实时监测声纹...");
          break;
      }

      // 开始频谱可视化
      startVisualization();

      // 设置自动停止录音（训练模式下15秒后自动停止）
      if (mode === RecordingMode.TRAINING) {
        const timerId = setTimeout(() => {
          console.log("训练录音结束");
          stopRecording();
          trainVoiceprint();
        }, 15000);

        // 返回清理函数，以便在组件卸载或重新录音时清除定时器
        return () => clearTimeout(timerId);
      }
    } catch (error) {
      console.error("开始录音失败:", error);
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("无法访问麦克风，请检查权限");
    }
  };

  // 停止录音
  const stopRecording = () => {
    console.log("have stoped");

    // 停止所有音频流
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // 断开处理器连接
    if (processorRef.current && audioContextRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // 关闭音频上下文
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // 停止可视化
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 停止倒计时
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // 如果是实时监测模式，清空实时识别器缓冲区
    if (
      recordingMode === RecordingMode.REALTIME &&
      realtimeRecognizerRef.current
    ) {
      realtimeRecognizerRef.current.clearBuffer();
    }

    setRecordingMode(RecordingMode.NONE);
    setFrequencies(undefined);
  };

  // 开始频谱可视化
  const startVisualization = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateVisualization = () => {
      if (!analyser) return;

      analyser.getByteFrequencyData(dataArray);
      setFrequencies(dataArray);

      animationFrameRef.current = requestAnimationFrame(updateVisualization);
    };

    updateVisualization();
  };

  // 训练声纹模型
  const trainVoiceprint = async () => {
    if (recordedChunksRef.current.length === 0 || !modelRef.current) {
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("没有录音数据或模型未加载");
      return;
    }

    setStatus(VoiceRecognitionStatus.TRAINING);
    setMessage("正在训练声纹模型...");

    try {
      // 保存训练样本用于未来模型校准
      await saveTrainingSamplesToCache(recordedChunksRef.current);

      // 提取特征
      const features = await extractFeatures(recordedChunksRef.current);
      if (!features) throw new Error("特征提取失败");

      // 使用模型提取声纹特征向量
      const voiceprint = tf.tidy(() => {
        // 前向传播获取声纹特征
        const prediction = modelRef.current!.predict(features) as tf.Tensor;
        // 归一化特征向量
        return tf.div(prediction, tf.norm(prediction));
      });

      // 保存声纹特征
      const voiceprintData = await voiceprint.data();
      voiceprintRef.current = new Float32Array(voiceprintData);

      // 保存到localStorage
      localStorage.setItem(
        "userVoiceprint",
        JSON.stringify(Array.from(voiceprintData)),
      );

      // 保存模型到缓存，以便页面刷新后重用
      await saveModelToCache(modelRef.current);

      setIsTrained(true);
      setStatus(VoiceRecognitionStatus.TRAINED);
      setMessage("声纹模型训练完成并已保存");

      // 初始化实时识别器 - 使用现有的识别器对象设置声纹
      if (realtimeRecognizerRef.current) {
        realtimeRecognizerRef.current.setVoiceprint(voiceprintRef.current);
      }
      // 如果还没有识别器，重新加载模型创建一个
      else if (modelRef.current) {
        loadModel();
      }

      // 清理
      voiceprint.dispose();
      features.dispose();
    } catch (error) {
      console.error("训练失败:", error);
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("声纹训练失败");
    }
  };

  // 识别声纹
  const performVoiceRecognition = async () => {
    if (!isTrained || !voiceprintRef.current) {
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("请先训练声纹模型");
      return;
    }

    if (recordedChunksRef.current.length === 0 || !modelRef.current) {
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("没有录音数据或模型未加载");
      return;
    }

    try {
      const result = await recognizeVoice(
        recordedChunksRef.current,
        modelRef.current,
        voiceprintRef.current,
      );

      setMatchScore(result.score);
      setStatus(
        result.isMatch
          ? VoiceRecognitionStatus.MATCHED
          : VoiceRecognitionStatus.NOT_MATCHED,
      );

      setMessage(
        result.isMatch
          ? `声纹匹配成功！相似度: ${(result.score * 100).toFixed(2)}%`
          : `声纹不匹配。相似度: ${(result.score * 100).toFixed(2)}%`,
      );

      // 通知父组件
      if (onVoiceprintResult) {
        onVoiceprintResult(result);
      }
    } catch (error) {
      console.error("识别失败:", error);
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("声纹识别失败");
    }
  };

  // 清除训练数据
  const clearTrainedData = async () => {
    // 清除localStorage中的声纹数据
    localStorage.removeItem("userVoiceprint");
    voiceprintRef.current = null;

    // 清除所有缓存的模型和训练样本
    await clearModelCache();

    setIsTrained(false);
    setStatus(VoiceRecognitionStatus.IDLE);
    setMessage("声纹数据已清除");

    // 如果有实时识别器，清空其声纹数据
    if (realtimeRecognizerRef.current) {
      realtimeRecognizerRef.current.setVoiceprint(null);
    }

    // 重新加载模型，确保所有组件都使用统一的模型
    loadModel();
  };

  // 开始实时监测
  const startRealtimeMonitoring = async () => {
    if (!isTrained || !voiceprintRef.current) {
      setStatus(VoiceRecognitionStatus.ERROR);
      setMessage("请先训练声纹模型");
      return;
    }

    // 确保实时识别器已正确初始化
    if (!realtimeRecognizerRef.current && modelRef.current) {
      // 如果实时识别器不存在但模型存在，重新创建识别器
      realtimeRecognizerRef.current = new RealtimeVoiceprintRecognizer(
        modelRef.current,
        {
          matchThreshold: 0.6, // 调整实时监测的阈值
          cooldownPeriod: 1000, // 减少冷却时间提高响应速度
          slidingWindowSize: 2500, // 减少窗口大小提高实时性
          slidingWindowStep: 800, // 调整步进提高准确率
        },
        (result) => {
          // 回调处理识别结果
          setMatchScore(result.score);
          setStatus(
            result.isMatch
              ? VoiceRecognitionStatus.MATCHED
              : VoiceRecognitionStatus.NOT_MATCHED,
          );

          // 通知父组件
          if (onVoiceprintResult) {
            onVoiceprintResult(result);
          }
        },
      );

      // 设置声纹
      realtimeRecognizerRef.current.setVoiceprint(voiceprintRef.current);
    } else if (realtimeRecognizerRef.current) {
      // 如果已存在识别器，确保声纹设置正确
      realtimeRecognizerRef.current.setVoiceprint(voiceprintRef.current);
    }

    // 开始录音和监测
    startRecording(RecordingMode.REALTIME);
  };

  return (
    <div className={styles.voiceRecognitionContainer}>
      <h2 className={styles.title}>TensorFlow声纹识别</h2>

      <div className={styles.statusContainer}>
        <div className={styles.statusIndicator}>
          <div
            className={`${styles.statusDot} ${styles[status.toLowerCase()]}`}
          ></div>
          <span className={styles.statusText}>{status}</span>
        </div>
        <p className={styles.message}>{message}</p>
      </div>

      {/* 添加训练提示文本显示区域 */}
      {recordingMode === RecordingMode.TRAINING && (
        <div className={styles.promptContainer}>
          <div className={styles.promptBox}>
            <h3>请朗读以下文本：</h3>
            <p className={styles.promptTextZh}>
              {trainingPrompts[promptIndex].zh}
            </p>
            <p className={styles.promptTextEn}>
              {trainingPrompts[promptIndex].en}
            </p>
            <div className={styles.recordingIndicator}>
              <span className={styles.recordingDot}></span> 录音中...
              <span className={styles.countdown}>剩余时间: {countdown} 秒</span>
            </div>
            {/* 添加手动结束录音按钮 */}
            <button
              className={`${styles.button} ${styles.stopTrainingButton}`}
              onClick={() => {
                stopRecording();
                trainVoiceprint();
              }}
            >
              结束录音并训练
            </button>
          </div>
        </div>
      )}
      {/* 控制按钮区域 */}
      <div className={styles.visualizerContainer}>
        <VoicePrint
          frequencies={frequencies}
          isActive={recordingMode !== RecordingMode.NONE}
        />
      </div>

      <div className={styles.controlsContainer}>
        <div className={styles.trainingControls}>
          <h3>训练声纹</h3>
          <button
            className={styles.button}
            onClick={() => startRecording(RecordingMode.TRAINING)}
            disabled={recordingMode !== RecordingMode.NONE}
          >
            录制训练音频
          </button>
          <button
            className={styles.button}
            onClick={async () => {
              await clearTrainedData();
            }}
            disabled={!isTrained}
          >
            清除训练数据
          </button>
        </div>

        <div className={styles.recognitionControls}>
          <h3>声纹识别</h3>
          <button
            className={styles.button}
            onClick={() => startRecording(RecordingMode.RECOGNITION)}
            disabled={recordingMode !== RecordingMode.NONE || !isTrained}
          >
            开始录音
          </button>
          <button
            className={styles.button}
            onClick={() => {
              stopRecording();
              performVoiceRecognition();
            }}
            disabled={recordingMode === RecordingMode.NONE}
          >
            停止并识别
          </button>
          {/* 添加实时监测按钮 */}
          <button
            className={`${styles.button} ${
              recordingMode === RecordingMode.REALTIME ? styles.active : ""
            }`}
            onClick={async () => {
              if (recordingMode === RecordingMode.REALTIME) {
                stopRecording();
              } else {
                await startRealtimeMonitoring();
              }
            }}
            disabled={!isTrained}
          >
            {recordingMode === RecordingMode.REALTIME
              ? "停止实时监测"
              : "开始实时监测"}
          </button>
        </div>
      </div>

      {status === VoiceRecognitionStatus.MATCHED ||
      status === VoiceRecognitionStatus.NOT_MATCHED ? (
        <div className={styles.resultContainer}>
          <div className={styles.scoreBar}>
            <div
              className={styles.scoreIndicator}
              style={{ width: `${Math.max(0, matchScore * 100)}%` }}
            ></div>
          </div>
          <div className={styles.scoreValue}>
            相似度: {(matchScore * 100).toFixed(2)}%
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TensorFlow;
