// 声纹训练提示文本配置
export const trainingPrompts = [
  {
    zh: "我的声音是独一无二的生物特征",
    en: "My voice is a unique biometric feature",
  },
  {
    zh: "声纹识别技术可以提高系统安全性",
    en: "Voice recognition technology can enhance system security",
  },
  {
    zh: "请使用自然的语调朗读这段文字",
    en: "Please read this text with your natural tone",
  },
  {
    zh: "人工智能正在改变我们的生活方式",
    en: "Artificial intelligence is changing our way of life",
  },
  {
    zh: "语音识别和声纹识别是不同的技术",
    en: "Speech recognition and voice recognition are different technologies",
  },
];

// 声纹训练提示文本类型
export interface TrainingPrompt {
  zh: string;
  en: string;
}
