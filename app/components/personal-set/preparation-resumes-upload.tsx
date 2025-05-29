"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./preparation-resumes-upload.module.scss";
import pdfToText from "react-pdftotext";

// 判断当前是否为开发环境
const isDevelopment = process.env.NODE_ENV === "development";
import {
  USER_RESUMES_STORAGE_KEY,
  USER_RESUMES_NAME_STORAGE_KEY,
} from "@/app/constant";

interface PreparationResumesUploadProps {
  onClose?: () => void; // 添加关闭回调函数
}

/**
 * 给在chat中 dosubmit()要提交的文本 添加prompt
 * @param text 面试官的问题
 * @param isEnglish 是否使用英文
 */
export function additionalResumeText(text: string, isEnglish: boolean = false) {
  const addtionTextHead =
    "\n\nYou are now a super interview assistant and need to respond to the interviewer's questions above .\n" +
    "All answers should be in " +
    (isEnglish ? "English" : "Chinese") +
    " Language.\n" +
    "Below is your resume, please answer the questions based on the contents of the resume:\n\n";

  const additionalText = localStorage.getItem(USER_RESUMES_STORAGE_KEY);
  if (additionalText) {
    return text + addtionTextHead + additionalText;
  }
  return text;
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

  // 引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileRef = useRef<File | null>(null);

  // 检查本地存储是否有简历数据
  useEffect(() => {
    const storedResume = localStorage.getItem(USER_RESUMES_STORAGE_KEY);
    const storedName = localStorage.getItem(USER_RESUMES_NAME_STORAGE_KEY);
    if (storedResume) {
      setHasResume(true);
      setResumeText(storedResume);
    }
    if (storedName) {
      setResumeFileName(storedName);
    }
  }, []);

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

      // 检查文件大小（移动端可能有限制）
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        setErrorMessage("文件大小不能超过50MB");
        alert("文件大小不能超过50MB");
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

    // 检测是否为移动端
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );

    if (isMobile) {
      console.log("检测到移动端设备，使用优化的处理流程");
      // 移动端给用户更多反馈
      setErrorMessage("正在处理文件，请稍候...");
    }

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

  // 提取PDF文本 - 使用react-pdftotext库提取
  const extractPdfText = async () => {
    console.log("开始提取PDF文本");

    if (!uploadedFileRef.current) return;

    setIsExtracting(true);
    setErrorMessage("");
    setExtractProgress(10); // 初始进度

    try {
      const fileToProcess = uploadedFileRef.current;

      // 设置进度为30%表示开始处理
      setExtractProgress(30);
      console.log("准备提取PDF文本...");

      // 检测移动端并添加超时处理
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      const timeout = isMobile ? 30000 : 15000; // 移动端给更长的超时时间

      // 使用Promise.race添加超时控制
      let extractedText = await Promise.race([
        pdfToText(fileToProcess),
        new Promise<string>((_, reject) =>
          setTimeout(
            () => reject(new Error("文件处理超时，请尝试较小的文件")),
            timeout,
          ),
        ),
      ]);

      // 设置进度为90%表示提取完成
      setExtractProgress(90);

      // 处理可能的编码问题，特别是中文
      const replacementChar = "\uFFFD"; // Unicode 替换字符，表示无法识别的字符
      if (extractedText && extractedText.includes(replacementChar)) {
        console.log("检测到编码问题，尝试修复...");
        try {
          // 尝试通过readFileAsArrayBuffer读取并使用不同编码解码
          const arrayBuffer = await readFileAsArrayBuffer(fileToProcess);

          // 尝试不同的编码
          const encodings = ["utf-8", "gbk", "gb2312", "big5"];

          for (const encoding of encodings) {
            try {
              const decoder = new TextDecoder(encoding);
              const decodedText = decoder.decode(new Uint8Array(arrayBuffer));

              // 如果解码后的文本看起来更好（包含更少的问号），则使用它
              if (
                decodedText &&
                (!decodedText.includes(replacementChar) ||
                  decodedText.split(replacementChar).length <
                    extractedText.split(replacementChar).length)
              ) {
                console.log(`使用 ${encoding} 编码解码成功`);
                extractedText = decodedText;
                break;
              }
            } catch (e) {
              console.log(`使用 ${encoding} 编码解码失败`, e);
            }
          }
        } catch (encodingError) {
          console.warn("尝试修复编码问题失败", encodingError);
        }
      }

      if (extractedText && extractedText.trim().length > 0) {
        console.log("成功提取文本，长度:", extractedText.length);
        console.log(extractedText); // 按要求输出提取内容

        setResumeText(extractedText);
        localStorage.setItem(USER_RESUMES_STORAGE_KEY, extractedText);
        setHasResume(true);
        setExtractProgress(100);

        // 清除处理中的提示信息
        if (errorMessage === "正在处理文件，请稍候...") {
          setErrorMessage("");
        }
      } else {
        throw new Error("提取的文本内容为空");
      }
    } catch (error: any) {
      console.error("PDF文本提取失败:", error);
      const errorMsg = error.message || String(error);
      setErrorMessage("PDF文本提取失败: " + errorMsg);

      // 移动端提供额外的建议
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      if (isMobile) {
        setErrorMessage(errorMsg + " (建议：尝试较小的PDF文件或在电脑端操作)");
      }
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
