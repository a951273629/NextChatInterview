import { useState, useEffect } from "react";

export type RecognitionLanguage = "auto-detect" | "en-US" | "ja-JP" | "fr-FR";

// 语言选项配置，用于UI渲染
export const LANGUAGE_OPTIONS = [
  { value: "auto-detect", label: "中英混合 / Mixed (CN-EN)" },
  { value: "en-US", label: "English (US)" },
  { value: "ja-JP", label: "日本語 (Japanese)" },
  { value: "fr-FR", label: "Français (French)" },
] as const;

export function useInterviewLanguage(): [
  RecognitionLanguage,
  (language: RecognitionLanguage) => void,
  boolean,
  boolean,
] {
  const [language, setLanguage] = useState<RecognitionLanguage>(() => {
    if (typeof window === "undefined") {
      return "auto-detect";
    }
    const savedLanguage = localStorage.getItem(
      "interviewLanguage",
    ) as RecognitionLanguage;
    return savedLanguage || "auto-detect";
  });

  useEffect(() => {
    localStorage.setItem("interviewLanguage", language);
  }, [language]);

  const isEnglish = language === "en-US";
  const isChinese = language === "auto-detect"; // 将中英混合视为包含中文

  return [language, setLanguage, isEnglish, isChinese];
} 