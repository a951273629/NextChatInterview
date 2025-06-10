import { useState, useEffect } from "react";

export type RecognitionLanguage = "zh-CN" | "en-US";

export function useInterviewLanguage(): [
  RecognitionLanguage,
  (language: RecognitionLanguage) => void,
  boolean,
  boolean,
] {
  const [language, setLanguage] = useState<RecognitionLanguage>(() => {
    if (typeof window === "undefined") {
      return "zh-CN";
    }
    const savedLanguage = localStorage.getItem(
      "interviewLanguage",
    ) as RecognitionLanguage;
    return savedLanguage || "zh-CN";
  });

  useEffect(() => {
    localStorage.setItem("interviewLanguage", language);
  }, [language]);

  const isEnglish = language === "en-US";
  const isChinese = language === "zh-CN";

  return [language, setLanguage, isEnglish, isChinese];
} 