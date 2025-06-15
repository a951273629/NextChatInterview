"use client";
import React, { useState, useRef, useEffect } from "react";
import styles from "./preparation-resumes-upload.module.scss";
import {
  USER_RESUMES_STORAGE_KEY,
  USER_RESUMES_NAME_STORAGE_KEY,
} from "@/app/constant";
import { extractTextFromPDF, type ProgressCallback } from "./resumes-extract"; 

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

// 判断当前是否为开发环境
const isDevelopment = process.env.NODE_ENV === "development";

interface PreparationResumesUploadProps {
  onClose?: () => void; // 添加关闭回调函数
}

/**
 * 给在chat中 dosubmit()要提交的文本 添加prompt
 * @param text 面试官的问题
 */
export function additionalResumeText(text: string) {

  const selectLanguage =  localStorage.getItem("interviewLanguage") ==='auto-detect' ? "Chinese" : localStorage.getItem("interviewLanguage");
  const addtionText =
    `
    Interview Question:
      ${text}

    Promt:
      You are now a super interview assistant. Answer all upcoming questions in ${typeof window !== 'undefined' ? selectLanguage || "Chinese" : "Chinese"} language. Base every answer strictly on my résumé. Speak succinctly and positively.
     When responding, think step-by-step using the STAR method before you speak, but reveal only the final polished answer.
     For behavioral questions, structure each reply as Situation → Action → Result and keep it under 2 minutes.
     Whenever possible, include one quantified metric (e.g., % improvement, $ savings) to demonstrate impact.
     Avoid filler words (‘um’, ‘like’) and finish with a forward-looking statement connecting to the company’s needs.
    
    Rules:
      1. Use STAR / CAR / PAR consistently — Choose the framework that best fits the question, ensuring a clear beginning, action, and result.
      2. Keep answers between ≈ 60–120 seconds; complex behavioral stories may extend to 2–3 minutes but never ramble.
      3. Quantify achievements—cite numbers, percentages, or ranges to enhance credibility; approximate honestly if exact figures are unavailable. 
      4. Tell a compelling story—create a clear arc (setup–challenge–resolution) that hooks the interviewer emotionally. 
      5. Align with the job description—highlight skills the role values and mirror its language for relevance.
      6. Stay positive and candid—frame setbacks as learning moments and avoid blaming others. 
      7. Use resume-backed specifics only—no invented facts; verify every example against your documented experience.

    
    Fllow Resume Content:
      ${typeof window !== 'undefined' ? localStorage.getItem(USER_RESUMES_STORAGE_KEY) : ''}
    `;
    
  return addtionText;
}

const PreparationResumesUpload: React.FC<PreparationResumesUploadProps> = ({
  onClose,
}) => {
  // 状态管理
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [extractProgress, setExtractProgress] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [hasResume, setHasResume] = useState<boolean>(false);
  const [resumeText, setResumeText] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resumeFileName, setResumeFileName] = useState<string>("");
  const [isClientReady, setIsClientReady] = useState<boolean>(false);

  // 引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileRef = useRef<File | null>(null);

  // 客户端初始化
  useEffect(() => {
    // 确保在客户端环境中初始化
    if (typeof window !== 'undefined') {
      setIsClientReady(true);
      console.log("[PDF] 客户端环境已就绪，可以处理PDF文件");
    }
  }, []);

  // 检查本地存储是否有简历数据
  useEffect(() => {
    if (!isClientReady) return;
    
    const storedResume = localStorage.getItem(USER_RESUMES_STORAGE_KEY);
    const storedName = localStorage.getItem(USER_RESUMES_NAME_STORAGE_KEY);
    if (storedResume) {
      setHasResume(true);
      setResumeText(storedResume);
    }
    if (storedName) {
      setResumeFileName(storedName);
    }
  }, [isClientReady]);

  /**
   * 测试环境读取指定PDF文件
   * 读取 app/mock/net 江西财经大学 王楠 2年工作经验.pdf 文件
   */
  const TestFileSelect = async () => {
    try {
      setErrorMessage("");
      console.log("测试环境，自动加载测试简历...");

      // 在测试环境中尝试读取模拟PDF文件
      // 注意：文件路径是相对于public目录的，确保文件已放在正确位置
      const response = await fetch(
        "/mock/net 江西财经大学 王楠 2年工作经验.pdf",
      );

      // 将获取的内容转换为Blob
      const pdfBlob = await response.blob();

      // 创建File对象
      const file = new File([pdfBlob], "江西财经大学 王楠 2年工作经验.pdf", {
        type: "application/pdf",
      });

      // 调用处理文件的函数
      handleFile(file);

      console.log("测试简历加载成功！");
    } catch (error) {
      console.error("加载测试简历失败:", error);
      setErrorMessage("加载测试简历失败");
    }
  };

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
    console.log("开始处理文件:", file.name, "大小:", file.size);

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
    console.log("开始提取PDF文本");

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
      console.log("准备提取PDF文本...");

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
        console.log(result.text); // 按要求输出提取内容

        setResumeText(result.text);
        localStorage.setItem(USER_RESUMES_STORAGE_KEY, result.text);
        setHasResume(true);
        setExtractProgress(100);

        // 清除处理中的提示信息
        if (errorMessage === "正在处理文件，请稍候...") {
          setErrorMessage("");
        }
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
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className={styles["modal-overlay"]} onClick={handleBackgroundClick}>
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

          {/* 测试环境按钮 */}
          {isDevelopment && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className={styles["test-button"]}
                onClick={TestFileSelect}
                style={{
                  marginTop: "1rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#2196F3",
                  color: "white",
                  border: "none",
                  borderRadius: "0.3rem",
                  cursor: "pointer",
                }}
              >
                加载测试简历
              </button>
              <button
                className={styles["test-button"]}
                onClick={() => {
                  if (uploadedFileRef.current) {
                    extractPdfText();
                  } else {
                    setErrorMessage("请先上传或选择文件");
                  }
                }}
                style={{
                  marginTop: "1rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "0.3rem",
                  cursor: "pointer",
                }}
              >
                重新提取文本
              </button>
            </div>
          )}

          {/* 状态显示 */}
          {renderStatus()}

          {/* 调试信息（仅在开发环境显示） */}
          {isDevelopment && errorMessage && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.5rem",
                backgroundColor: "#ffebee",
                border: "1px solid #ffcdd2",
                borderRadius: "0.3rem",
                fontSize: "0.8rem",
                color: "#c62828",
              }}
            >
              <div>
                <strong>错误详情：</strong>
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: "0.5rem 0",
                }}
              >
                {errorMessage}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreparationResumesUpload;
