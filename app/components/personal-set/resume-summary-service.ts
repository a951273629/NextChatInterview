/**
 * 简历总结服务模块
 * 使用LLM对简历进行智能总结和结构化处理
 * 基于chat.ts的LLM调用模式，专门优化简历分析场景
 */

import { getClientApi } from "@/app/client/api";
import { ModelConfig, useAppConfig } from "@/app/store/config";
import { useAccessStore } from "@/app/store/access";
import { useChatStore } from "@/app/store/chat";
import { createMessage } from "@/app/store/chat";

// 进度回调函数类型
export type SummaryProgressCallback = (progress: number, stage: string) => void;

// 简历总结结果类型
export interface ResumeSummaryResult {
  success: boolean;
  summaryText: string;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;
  processingTime: number;
  model: string;
  error?: string;
}

// 简历数据结构（localStorage存储格式）
export interface ResumeData {
  originalText?: string;      // 原始文本（可选保留）
  summaryText: string;        // LLM总结文本
  summaryTimestamp: number;   // 总结时间
  fileHash: string;           // 文件哈希
  summaryModel: string;       // 使用的模型
  summaryVersion: string;     // 总结版本
  isOriginal: boolean;        // 是否为原始文本
  compressionRatio: number;   // 压缩比率
}

// 文件哈希计算
export function calculateFileHash(content: string): Promise<string> {
  return new Promise(async (resolve) => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        resolve(hashHex.slice(0, 16)); // 使用前16位作为简短哈希
      } catch (error) {
        console.warn('[Hash] 使用crypto API失败，使用简单哈希算法', error);
        resolve(simpleHash(content));
      }
    } else {
      resolve(simpleHash(content));
    }
  });
}

// 简单哈希算法（备用方案）
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return Math.abs(hash).toString(16).slice(0, 16);
}

/**
 * 结构化简历总结提示词模板
 * 参考了 https://www.mercity.ai/blog-post/build-an-llm-based-resume-analyzer 的最佳实践
 */
const RESUME_SUMMARY_PROMPT = `你是一位专业的人力资源专家和简历分析师。请对以下简历进行结构化总结和分析。

**总结要求：**
1. 将简历内容压缩为原长度的50-70%，保留所有关键信息
2. 使用结构化格式，便于后续面试准备和快速查阅
3. 保持原文的语言风格（中文/英文）
4. 突出候选人的核心竞争力和独特价值

**输出格式（严格按照以下JSON结构）：**
\`\`\`json
{
  "personal_info": {
    "name": "姓名",
    "contact": "联系方式摘要",
    "location": "地理位置"
  },
  "professional_summary": "2-3句话的职业概述，突出核心优势和价值定位",
  "core_skills": [
    "技能1", "技能2", "技能3"
  ],
  "work_experience": [
    {
      "company": "公司名称",
      "position": "职位",
      "duration": "时间段",
      "key_achievements": ["成就1", "成就2"],
      "technologies": ["技术栈"]
    }
  ],
  "education": [
    {
      "institution": "学校名称", 
      "degree": "学位",
      "major": "专业",
      "duration": "时间段"
    }
  ],
  "projects": [
    {
      "name": "项目名称",
      "description": "项目描述",
      "technologies": ["技术栈"],
      "impact": "项目影响/成果"
    }
  ],
  "certifications": ["证书1", "证书2"],
  "strengths": ["优势1", "优势2", "优势3"],
  "interview_highlights": [
    "面试亮点1：STAR格式的具体例子",
    "面试亮点2：量化的成就数据"
  ]
}
\`\`\`

**分析指导原则：**
- 提取可量化的成就（数字、百分比、规模）
- 识别跨领域的可迁移技能
- 评估项目的实际影响力和复杂度
- 为面试准备提供STAR格式的故事素材
- 保持信息的准确性，不添加原文中没有的内容

**简历内容：**
{{RESUME_CONTENT}}

请严格按照上述JSON格式输出总结结果。`;

// 简单的Token长度估算函数（1个token约等于4个字符）
function estimateTokenLength(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Token长度预检查
 */
export function checkTokenLength(text: string, maxTokens: number = 6000): {
  isValid: boolean;
  estimatedTokens: number;
  needsSegmentation: boolean;
} {
  const estimatedTokens = estimateTokenLength(text);
  
  return {
    isValid: estimatedTokens <= maxTokens,
    estimatedTokens,
    needsSegmentation: estimatedTokens > maxTokens
  };
}

/**
 * 文本分段处理（如果超过Token限制）
 */
export function segmentResumeText(text: string, maxTokensPerSegment: number = 4000): string[] {
  const sections = text.split(/\n\s*\n/); // 按段落分割
  const segments: string[] = [];
  let currentSegment = '';
  
  for (const section of sections) {
    const testSegment = currentSegment + '\n\n' + section;
    
    if (estimateTokenLength(testSegment) <= maxTokensPerSegment) {
      currentSegment = testSegment;
    } else {
      if (currentSegment) {
        segments.push(currentSegment.trim());
      }
      currentSegment = section;
    }
  }
  
  if (currentSegment) {
    segments.push(currentSegment.trim());
  }
  
  return segments.filter(segment => segment.length > 0);
}

/**
 * 主要的简历总结函数
 */
export async function summarizeResume(
  resumeText: string,
  onProgress?: SummaryProgressCallback
): Promise<ResumeSummaryResult> {
  const startTime = Date.now();
  
  try {
    onProgress?.(10, "准备LLM分析...");
    
    // 1. Token长度预检查
    const tokenCheck = checkTokenLength(resumeText, 6000);
    console.log(`[Resume Summary] Token检查: ${tokenCheck.estimatedTokens} tokens, 需要分段: ${tokenCheck.needsSegmentation}`);
    
    onProgress?.(20, "检查Token长度...");
    
    // 2. 获取当前会话的模型配置
    const chatStore = useChatStore.getState();
    const currentSession = chatStore.currentSession();
    const modelConfig = currentSession.mask.modelConfig;
    
    onProgress?.(30, "初始化LLM客户端...");
    
    // 3. 获取API客户端
    const api = getClientApi(modelConfig.providerName);
    
    // 4. 准备总结内容
    let contentToSummarize = resumeText;
    if (tokenCheck.needsSegmentation) {
      const segments = segmentResumeText(resumeText, 4000);
      console.log(`[Resume Summary] 分段处理: ${segments.length} 个段落`);
      
      // 对于分段内容，取前几个重要段落
      contentToSummarize = segments.slice(0, 3).join('\n\n');
      onProgress?.(40, `处理分段内容 (${segments.length} 段)...`);
    }
    
    // 5. 构建提示词
    const prompt = RESUME_SUMMARY_PROMPT.replace('{{RESUME_CONTENT}}', contentToSummarize);
    
    onProgress?.(50, "开始LLM总结...");
    
    // 6. 创建消息
    const messages = [
      createMessage({
        role: "user",
        content: prompt,
      })
    ];
    
    // 7. 调用LLM进行总结
    let summaryResult = '';
    let hasError = false;
    let errorMessage = '';
    
    await new Promise<void>((resolve, reject) => {
      api.llm.chat({
        messages,
        config: {
          ...modelConfig,
          stream: false, // 使用非流式模式获取完整结果
          temperature: 0.1, // 较低的temperature确保结果稳定
        },
        onFinish: (message) => {
          summaryResult = message;
          onProgress?.(90, "处理总结结果...");
          resolve();
        },
        onError: (error) => {
          console.error('[Resume Summary] LLM调用失败:', error);
          hasError = true;
          errorMessage = error.message || String(error);
          reject(error);
        },
        onUpdate: (message) => {
          // 流式更新进度
          const progress = Math.min(85, 50 + (message.length / 1000) * 30);
          onProgress?.(progress, "生成总结中...");
        }
      });
    });
    
    if (hasError) {
      throw new Error(errorMessage);
    }
    
    onProgress?.(95, "验证总结质量...");
    
    // 8. 验证总结结果
    if (!summaryResult || summaryResult.trim().length < 100) {
      throw new Error('LLM总结结果为空或过短');
    }
    
    // 9. 计算压缩比率
    const originalLength = resumeText.length;
    const summaryLength = summaryResult.length;
    const compressionRatio = summaryLength / originalLength;
    
    onProgress?.(100, "总结完成!");
    
    // 10. 返回结果
    const processingTime = Date.now() - startTime;
    
    console.log(`[Resume Summary] 总结完成:`, {
      originalLength,
      summaryLength,
      compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
      processingTime: `${processingTime}ms`,
      model: modelConfig.model
    });
    
    return {
      success: true,
      summaryText: summaryResult,
      originalLength,
      summaryLength,
      compressionRatio,
      processingTime,
      model: modelConfig.model
    };
    
  } catch (error: any) {
    console.error('[Resume Summary] 总结失败:', error);
    
    return {
      success: false,
      summaryText: '',
      originalLength: resumeText.length,
      summaryLength: 0,
      compressionRatio: 0,
      processingTime: Date.now() - startTime,
      model: 'unknown',
      error: error.message || String(error)
    };
  }
} 