import React, { createContext, useContext, useState, ReactNode } from "react";

// 语言类型定义
export type RecognitionLanguage = "zh-CN" | "en-US";

// Context类型定义
interface LanguageContextType {
  recognitionLanguage: RecognitionLanguage;
  setRecognitionLanguage: (language: RecognitionLanguage) => void;
  isEnglish: boolean;
  isChinese: boolean;
}

// 创建Context
const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

// Provider Props接口
interface LanguageProviderProps {
  children: ReactNode;
}

// LanguageProvider组件
export const LanguageProvider: React.FC<LanguageProviderProps> = ({
  children,
}) => {
  const [recognitionLanguage, setRecognitionLanguage] =
    useState<RecognitionLanguage>("zh-CN");

  // 计算派生状态
  const isEnglish = recognitionLanguage === "en-US";
  const isChinese = recognitionLanguage === "zh-CN";

  const contextValue: LanguageContextType = {
    recognitionLanguage,
    setRecognitionLanguage,
    isEnglish,
    isChinese,
  };

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};

// 自定义Hook
export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
