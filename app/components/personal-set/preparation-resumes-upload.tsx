"use client";
import React, { useState, useRef, useEffect } from "react";
import styles from "./preparation-resumes-upload.module.scss";
import {
  USER_RESUMES_STORAGE_KEY,
  USER_RESUMES_NAME_STORAGE_KEY,
  Path,
} from "@/app/constant";
import { extractTextFromPDF, type ProgressCallback } from "./resumes-extract";
import { 
  summarizeResume, 
  calculateFileHash, 
  type SummaryProgressCallback, 
  type ResumeData,
  type ResumeSummaryResult 
} from "./resume-summary-service"; 
import { useNavigate } from "react-router-dom";

// 自定义Prompt存储key
const CUSTOM_PROMPT_STORAGE_KEY = "custom_interview_prompt";

// 默认Prompt模板
const DEFAULT_PROMPT = `You are now a super interview assistant. Answer all upcoming questions in {language} language. Base every answer strictly on my résumé. Speak succinctly and positively.
When responding, think step-by-step using the STAR method before you speak, but reveal only the final polished answer.
For behavioral questions, structure each reply as Situation → Action → Result and keep it under 2 minutes.

Rules:

1. Keep it short and simple: 
“Answers should be concise and avoid length.”
“Each response should be no more than [number of] words.”

2. Naturally Colloquial: 
“Use expressions found in everyday conversation.”
“Avoid complex terminology or industry jargon.”

3.Clearly structured:
“Answers should contain: a short introduction, a core point, a specific example, and a summary.”
“Use a short paragraph or list format.”`;

// Promise.withResolvers 类型声明
declare global {
  interface PromiseConstructor {
    withResolvers<T>(): {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: any) => void;
    };
  }
}

// Promise.withResolvers polyfill for Node.js 20.x compatibility
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
}

interface PreparationResumesUploadProps {
  onClose?: () => void; // 添加关闭回调函数
}

/**
 * 给在chat中 dosubmit()要提交的文本 添加prompt
 * @param text 面试官的问题
 */
export function additionalResumeText(text: string) {
  const selectLanguage = localStorage.getItem("interviewLanguage") === 'auto-detect' ? "Chinese" : localStorage.getItem("interviewLanguage");
  
  // 获取自定义Prompt，如果没有则使用默认Prompt
  const customPrompt = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_PROMPT_STORAGE_KEY) : null;
  const prompt = customPrompt || DEFAULT_PROMPT.replace('{language}', selectLanguage || "Chinese");
  
  const addtionText = `
    Interview Question:
      ${text}

    Promt:
      ${prompt}
    
    Fllow Resume Content:
      ${typeof window !== 'undefined' ? localStorage.getItem(USER_RESUMES_STORAGE_KEY) : ''}
    `;
    
  return addtionText;
}

const PreparationResumesUpload: React.FC<PreparationResumesUploadProps> = ({
  onClose,
}) => {

  const navigate = useNavigate();

  // 状态管理
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [extractProgress, setExtractProgress] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [summaryProgress, setSummaryProgress] = useState<number>(0);
  const [summaryStage, setSummaryStage] = useState<string>("");
  const [hasResume, setHasResume] = useState<boolean>(false);
  const [resumeText, setResumeText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resumeFileName, setResumeFileName] = useState<string>("");
  const [isClientReady, setIsClientReady] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState<string>("");

  // 引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileRef = useRef<File | null>(null);

  // 客户端初始化
  useEffect(() => {
    // 确保在客户端环境中初始化
    if (typeof window !== 'undefined') {
      setIsClientReady(true);
      // console.log("[PDF] 客户端环境已就绪，可以处理PDF文件");
    }
  }, []);

  // 检查本地存储是否有简历数据和自定义Prompt
  useEffect(() => {
    if (!isClientReady) return;
    
    const storedResume = localStorage.getItem(USER_RESUMES_STORAGE_KEY);
    const storedName = localStorage.getItem(USER_RESUMES_NAME_STORAGE_KEY);
    const storedPrompt = localStorage.getItem(CUSTOM_PROMPT_STORAGE_KEY);
    
    if (storedResume) {
      setHasResume(true);
      setResumeText(storedResume);
    }
    if (storedName) {
      setResumeFileName(storedName);
    }
    if (storedPrompt) {
      setCustomPrompt(storedPrompt);
    } else {
      // 如果没有自定义Prompt，使用默认的作为初始值
      const selectLanguage = localStorage.getItem("interviewLanguage") === 'auto-detect' ? "Chinese" : localStorage.getItem("interviewLanguage");
      setCustomPrompt(DEFAULT_PROMPT.replace('{language}', selectLanguage || "Chinese"));
    }
  }, [isClientReady]);


  // 处理文件选择
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    setErrorMessage("");
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];

      // 防止重复处理同一个文件
      if (
        uploadedFileRef.current &&
        uploadedFileRef.current.name === file.name &&
        uploadedFileRef.current.size === file.size
      ) {
        console.log("检测到重复文件选择，跳过处理");
        return;
      }

      // 检查文件类型
      if (file.type !== "application/pdf") {
        setErrorMessage("请上传PDF格式的文件");
        alert("请上传PDF格式的文件");
        // 清空input值，允许重新选择
        if (event.target) {
          event.target.value = "";
        }
        return;
      }

      // 检查文件大小（限制为3MB）
      const maxSize = 3 * 1024 * 1024; // 3MB
      if (file.size > maxSize) {
        setErrorMessage("文件大小不能超过3MB");
        alert("文件大小不能超过3MB");
        if (event.target) {
          event.target.value = "";
        }
        return;
      }

      handleFile(file);
    } else {
      // 处理文件选择被取消的情况
      console.log("文件选择被取消");
    }
  };

  // 统一处理文件的函数
  const handleFile = (file: File) => {
    // console.log("开始处理文件:", file.name, "大小:", file.size);

    // 重置状态
    setUploadedFile(file);
    uploadedFileRef.current = file;
    setResumeFileName(file.name);
    localStorage.setItem(USER_RESUMES_NAME_STORAGE_KEY, file.name);
    setUploadProgress(0);
    setExtractProgress(0);
    // 模拟上传进度
    simulateUploadProgress();
  };

  // 模拟上传进度
  const simulateUploadProgress = () => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setUploadProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);

        // 上传完成后开始提取文本
        extractPdfText();
      }
    }, 100); // 每100ms更新一次进度
  };

  // 提取PDF文本 - 使用PDF.js库提取
  const extractPdfText = async () => {
    // console.log("开始提取PDF文本");

    if (!uploadedFileRef.current) return;

    // 检查是否在客户端环境
    if (!isClientReady || typeof window === 'undefined') {
      setErrorMessage("PDF 处理仅在客户端环境中可用");
      return;
    }

    setIsExtracting(true);
    setErrorMessage("");
    setExtractProgress(0);

    try {
      const fileToProcess = uploadedFileRef.current;
      // console.log("准备提取PDF文本...");

      // 读取文件为ArrayBuffer
      const arrayBuffer = await readFileAsArrayBuffer(fileToProcess);
      
      // 创建进度回调函数
      const progressCallback: ProgressCallback = (progress: number) => {
        setExtractProgress(progress);
      };

      // 使用新的PDF.js提取函数
      const result = await extractTextFromPDF(arrayBuffer, progressCallback);

      if (result.success && result.text && result.text.trim().length > 0) {
        console.log("成功提取文本，长度:", result.text.length);
        console.log("PDF页数:", result.numPages);
        // console.log(result.text); // 按要求输出提取内容

        setExtractProgress(100);
        
        // 开始LLM总结流程
        await startLLMSummarization(result.text, fileToProcess.name);

      } else {
        throw new Error(result.error || "PDF文本提取失败，未能获取到文本内容");
      }
    } catch (error: any) {
      console.error("PDF文本提取失败:", error);
      const errorMsg = error.message || String(error);
      setErrorMessage("PDF文本提取失败: " + errorMsg);


    } finally {
      setIsExtracting(false);
    }
  };

  // LLM总结处理函数
  const startLLMSummarization = async (extractedText: string, fileName: string) => {
    try {
      setIsSummarizing(true);
      setSummaryProgress(0);
      setSummaryStage("准备总结...");

      // 1. 计算文件哈希，检查是否已经总结过
      const fileHash = await calculateFileHash(extractedText);
      const cacheKey = `resume_summary_${fileHash}`;
      const cachedSummary = localStorage.getItem(cacheKey);

      if (cachedSummary) {
        try {
          const cachedData: ResumeData = JSON.parse(cachedSummary);
          // console.log("发现缓存的总结数据，直接使用");
          
          // 使用缓存的总结
          setResumeText(cachedData.summaryText);
          localStorage.setItem(USER_RESUMES_STORAGE_KEY, cachedData.summaryText);
          localStorage.setItem(USER_RESUMES_NAME_STORAGE_KEY, fileName);
          setResumeFileName(fileName);
          setHasResume(true);
          setSummaryProgress(100);
          setSummaryStage("已使用缓存总结");
          
          // 清除处理中的提示信息
          if (errorMessage === "正在处理文件，请稍候...") {
            setErrorMessage("");
          }
          return;
        } catch (cacheError) {
          console.warn("缓存数据解析失败，重新总结", cacheError);
        }
      }

      // 2. 进行LLM总结
      setSummaryStage("调用LLM进行总结...");
      
      const summaryProgressCallback: SummaryProgressCallback = (progress: number, stage: string) => {
        setSummaryProgress(progress);
        setSummaryStage(stage);
      };

      const summaryResult: ResumeSummaryResult = await summarizeResume(extractedText, summaryProgressCallback);

      if (summaryResult.success && summaryResult.summaryText) {
        console.log("LLM总结成功:", {
          originalLength: summaryResult.originalLength,
          summaryLength: summaryResult.summaryLength,
          compressionRatio: `${(summaryResult.compressionRatio * 100).toFixed(1)}%`,
          model: summaryResult.model
        });

        // 3. 构建简历数据结构
        const resumeData: ResumeData = {
          summaryText: summaryResult.summaryText,
          summaryTimestamp: Date.now(),
          fileHash: fileHash,
          summaryModel: summaryResult.model,
          summaryVersion: "1.0",
          isOriginal: false,
          compressionRatio: summaryResult.compressionRatio
        };

        // 4. 保存到localStorage
        setResumeText(summaryResult.summaryText);
        localStorage.setItem(USER_RESUMES_STORAGE_KEY, summaryResult.summaryText);
        localStorage.setItem(USER_RESUMES_NAME_STORAGE_KEY, fileName);
        localStorage.setItem(cacheKey, JSON.stringify(resumeData));
        
        setResumeFileName(fileName);
        setHasResume(true);
        setSummaryProgress(100);
        setSummaryStage("总结完成!");
        
        // 清除处理中的提示信息
        if (errorMessage === "正在处理文件，请稍候...") {
          setErrorMessage("");
        }

        console.log("简历总结和存储完成");
        
      } else {
        // 总结失败，使用原始文本作为备选方案
        console.warn("LLM总结失败，使用原始文本:", summaryResult.error);
        
        const fallbackData: ResumeData = {
          summaryText: extractedText,
          summaryTimestamp: Date.now(),
          fileHash: fileHash,
          summaryModel: "fallback",
          summaryVersion: "1.0",
          isOriginal: true,
          compressionRatio: 1.0
        };

        setResumeText(extractedText);
        localStorage.setItem(USER_RESUMES_STORAGE_KEY, extractedText);
        localStorage.setItem(USER_RESUMES_NAME_STORAGE_KEY, fileName);
        localStorage.setItem(cacheKey, JSON.stringify(fallbackData));
        
        setResumeFileName(fileName);
        setHasResume(true);
        setSummaryStage("总结失败，已保存原文");
        
        // 设置警告信息而不是错误
        setErrorMessage(`LLM总结失败: ${summaryResult.error}，已保存原始简历文本`);
      }

    } catch (error: any) {
      console.error("LLM总结过程失败:", error);
      
      // 总结过程失败，使用原始文本作为备选方案
      const fallbackData: ResumeData = {
        summaryText: extractedText,
        summaryTimestamp: Date.now(),
        fileHash: await calculateFileHash(extractedText),
        summaryModel: "error",
        summaryVersion: "1.0",
        isOriginal: true,
        compressionRatio: 1.0
      };

      setResumeText(extractedText);
      localStorage.setItem(USER_RESUMES_STORAGE_KEY, extractedText);
      localStorage.setItem(USER_RESUMES_NAME_STORAGE_KEY, fileName);
      
      setResumeFileName(fileName);
      setHasResume(true);
      setSummaryStage("总结失败");
      
      const errorMsg = error.message || String(error);
      setErrorMessage(`总结过程出错: ${errorMsg}，已保存原始简历文本`);
      
    } finally {
      setIsSummarizing(false);
    }
  };

  // 将文件读取为ArrayBuffer - 保留此方法用于可能的其他用途
  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as ArrayBuffer);
        } else {
          reject(new Error("文件读取失败"));
        }
      };

      reader.onerror = (error) => {
        reject(error);
      };

      reader.readAsArrayBuffer(file);
    });
  };

  // 触发文件选择对话框
  // const openFileDialog = () => {
  //   if (fileInputRef.current) {
  //     fileInputRef.current.click();
  //   }
  // };

  // 渲染上传状态
  const renderStatus = () => {
    if (errorMessage) {
      return (
        <div className={`${styles["resume-status"]} ${styles["status-error"]}`}>
          <div className={styles["status-icon"]}>❌</div>
          <div className={styles["status-text"]}>{errorMessage}</div>
        </div>
      );
    } else if (!hasResume) {
      return (
        <div className={`${styles["resume-status"]} ${styles["status-error"]}`}>
          <div className={styles["status-icon"]}>⚠️</div>
          <div className={styles["status-text"]}>请上传一份简历</div>
        </div>
      );
    } else {
      return (
        <div
          className={`${styles["resume-status"]} ${styles["status-success"]}`}
        >
          <div className={styles["status-icon"]}>✅</div>
          <div className={styles["status-text"]}>已上传简历</div>
        </div>
      );
    }
  };

  // 处理点击背景关闭
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  // 处理关闭按钮点击
  const handleCloseClick = () => {

    navigate(Path.Chat);
  };

  // 处理自定义Prompt变化
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= 2000) {
      setCustomPrompt(value);
      localStorage.setItem(CUSTOM_PROMPT_STORAGE_KEY, value);
    }
  };

  // 重置为默认Prompt
  const resetToDefaultPrompt = () => {
    const selectLanguage = localStorage.getItem("interviewLanguage") === 'auto-detect' ? "Chinese" : localStorage.getItem("interviewLanguage");
    const defaultPrompt = DEFAULT_PROMPT.replace('{language}', selectLanguage || "Chinese");
    setCustomPrompt(defaultPrompt);
    localStorage.setItem(CUSTOM_PROMPT_STORAGE_KEY, defaultPrompt);
  };

  return (
    <div className={styles["modal-overlay"]}>
      <div
        className={styles["modal-content"]}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button className={styles["close-button"]} onClick={handleCloseClick}>
          ×
        </button>

        <div className={styles["resume-upload-container"]}>
          <h4 className={styles["section-title"]}>简历上传</h4>

          {/* 上传区域 */}
          <div
            className={`${styles["upload-area"]} ${
              uploadProgress > 0 && uploadProgress < 100
                ? styles["uploading"]
                : ""
            }`}
            // onClick={openFileDialog}
          >
            <input
              type="file"
              ref={fileInputRef}
              className={styles["file-input"]}
              accept="application/pdf"
              onChange={handleFileSelect}
            />
            <div className={styles["upload-icon"]}>📄</div>
            <div className={styles["upload-text"]}>
              {resumeFileName
                ? resumeFileName
                : hasResume && uploadedFileRef.current
                ? uploadedFileRef.current.name
                : "点击此处，上传简历文件"}
            </div>
            <div className={styles["upload-subtext"]}>仅支持 .pdf 文件类型</div>
          </div>

          {/* 上传进度 */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className={styles["upload-progress"]}>
              <div className={styles["progress-text"]}>
                <span className={styles["progress-label"]}>上传中...</span>
                <span className={styles["progress-percentage"]}>
                  {uploadProgress}%
                </span>
              </div>
              <div className={styles["progress-bar-container"]}>
                <div
                  className={styles["progress-bar"]}
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* 提取进度 */}
          {isExtracting && (
            <div className={styles["upload-progress"]}>
              <div className={styles["progress-text"]}>
                <span className={styles["progress-label"]}>提取文本中...</span>
                <span className={styles["progress-percentage"]}>
                  {extractProgress}%
                </span>
              </div>
              <div className={styles["progress-bar-container"]}>
                <div
                  className={styles["progress-bar"]}
                  style={{ width: `${extractProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* LLM总结进度 */}
          {isSummarizing && (
            <div className={styles["upload-progress"]}>
              <div className={styles["progress-text"]}>
                <span className={styles["progress-label"]}>
                  {summaryStage || "LLM智能总结中..."}
                </span>
                <span className={styles["progress-percentage"]}>
                  {summaryProgress}%
                </span>
              </div>
              <div className={styles["progress-bar-container"]}>
                <div
                  className={styles["progress-bar"]}
                  style={{ width: `${summaryProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* 测试环境按钮 */}
          {/* {isDevelopment && (
            <div className={styles["test-buttons-container"]}>
              <button
                className={`${styles["test-button"]} ${styles["primary"]}`}
                onClick={TestFileSelect}
              >
                加载测试简历
              </button>
              <button
                className={`${styles["test-button"]} ${styles["secondary"]}`}
                onClick={() => {
                  if (uploadedFileRef.current) {
                    extractPdfText();
                  } else {
                    setErrorMessage("请先上传或选择文件");
                  }
                }}
              >
                重新提取文本
              </button>
            </div>
          )} */}
          {/* 简历状态显示 */}
          {renderStatus()}
          {/* 自定义Prompt设置 */}
          <div className={styles["prompt-settings"]}>
            <div className={styles["prompt-header"]}>
              <h4 className={`${styles["section-title"]} ${styles["prompt-title"]}`}>Prompt提示词设置</h4>
              <button
                onClick={resetToDefaultPrompt}
                className={styles["reset-button"]}
              >
                重置默认
              </button>
            </div>
            <div className={styles["prompt-textarea-container"]}>
              <textarea
                value={customPrompt}
                onChange={handlePromptChange}
                placeholder="输入自定义面试助手Prompt..."
                rows={6}
                className={styles["prompt-textarea"]}
              />
              <div className={`${styles["char-counter"]} ${customPrompt.length > 1800 ? styles["warning"] : ""}`}>
                {customPrompt.length}/2000
              </div>
            </div>
            <div className={styles["prompt-description"]}>
              自定义Prompt将替换默认的面试助手指令，用于指导AI如何回答面试问题。
            </div>
          </div>



          {/* 调试信息（仅在开发环境显示） */}
          {/* {isDevelopment && errorMessage && (
            <div className={styles["debug-info"]}>
              <div>
                <strong>错误详情：</strong>
              </div>
              <pre className={styles["debug-content"]}>
                {errorMessage}
              </pre>
            </div>
          )} */}
        </div>
      </div>
    </div>
  );
};

export default PreparationResumesUpload;
