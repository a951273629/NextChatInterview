import {
  getMessageTextContent,
  isDalle3,
  safeLocalStorage,
  trimTopic,
} from "../utils";

import { indexedDBStorage } from "@/app/utils/indexedDB-storage";
import { nanoid } from "nanoid";
import type {
  ClientApi,
  MultimodalContent,
  RequestMessage,
} from "../client/api";
import { getClientApi } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import { showToast } from "../components/ui-lib";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_TEMPLATE,
  GEMINI_SUMMARIZE_MODEL,
  DEEPSEEK_SUMMARIZE_MODEL,
  KnowledgeCutOffDate,
  MCP_SYSTEM_TEMPLATE,
  MCP_TOOLS_TEMPLATE,
  ServiceProvider,
  StoreKey,
  SUMMARIZE_MODEL,
} from "../constant";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import { createPersistStore } from "../utils/store";
import { estimateTokenLength } from "../utils/token";
import { ModelConfig, ModelType, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import { collectModelsWithDefaultModel } from "../utils/model";
import { createEmptyMask, Mask } from "./mask";
// import { usePluginStore } from "./plugin";
import { executeMcpAction, getAllTools, isMcpEnabled } from "../mcp/actions";
import { LLMResponseData, SyncMode } from "../types/websocket-sync";
import { billingService, BillingResult } from "../services/BillingService";


const localStorage = safeLocalStorage();

export type ChatMessageTool = {
  id: string;
  index?: number;
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  content?: string;
  isError?: boolean;
  errorMsg?: string;
};

export type ChatMessage = RequestMessage & {
  date: string;
  streaming?: boolean;
  isError?: boolean;
  id: string;
  model?: ModelType;
  tools?: ChatMessageTool[];
  audio_url?: string;
  isMcpResponse?: boolean;
};

export function createMessage(override: Partial<ChatMessage>): ChatMessage {
  return {
    id: nanoid(),
    date: new Date().toLocaleString(),
    role: "user",
    content: "",
    ...override,
  };
}

export interface ChatStat {
  tokenCount: number;
  wordCount: number;
  charCount: number;
}

export interface ChatSession {
  id: string;
  topic: string;

  memoryPrompt: string;
  messages: ChatMessage[];
  stat: ChatStat;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndex?: number;

  mask: Mask;
}

export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
export const BOT_HELLO: ChatMessage = createMessage({
  role: "assistant",
  content: Locale.Store.BotHello,
});

function createEmptySession(): ChatSession {
  return {
    id: nanoid(),
    topic: DEFAULT_TOPIC,
    memoryPrompt: "",
    messages: [],
    stat: {
      tokenCount: 0,
      wordCount: 0,
      charCount: 0,
    },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,

    mask: createEmptyMask(),
  };
}

function getSummarizeModel(
  currentModel: string,
  providerName: string,
): string[] {
  // if it is using gpt-* models, force to use 4o-mini to summarize
  if (currentModel.startsWith("gpt") || currentModel.startsWith("chatgpt")) {
    const configStore = useAppConfig.getState();
    const accessStore = useAccessStore.getState();
    const allModel = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    const summarizeModel = allModel.find(
      (m) => m.name === SUMMARIZE_MODEL && m.available,
    );
    if (summarizeModel) {
      return [
        summarizeModel.name,
        summarizeModel.provider?.providerName as string,
      ];
    }
  }
  if (currentModel.startsWith("gemini")) {
    return [GEMINI_SUMMARIZE_MODEL, ServiceProvider.Google];
  } else if (currentModel.startsWith("deepseek-")) {
    return [DEEPSEEK_SUMMARIZE_MODEL, ServiceProvider.DeepSeek];
  }

  return [currentModel, providerName];
}

function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce(
    (pre, cur) => pre + estimateTokenLength(getMessageTextContent(cur)),
    0,
  );
}

function fillTemplateWith(input: string, modelConfig: ModelConfig) {
  const cutoff =
    KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default;
  // Find the model in the DEFAULT_MODELS array that matches the modelConfig.model
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  var serviceProvider = "OpenAI";
  if (modelInfo) {
    // TODO: auto detect the providerName from the modelConfig.model

    // Directly use the providerName from the modelInfo
    serviceProvider = modelInfo.provider.providerName;
  }

  const vars = {
    ServiceProvider: serviceProvider,
    cutoff,
    model: modelConfig.model,
    time: new Date().toString(),
    lang: getLang(),
    input: input,
  };

  let output = modelConfig.template ?? DEFAULT_INPUT_TEMPLATE;

  // remove duplicate
  if (input.startsWith(output)) {
    output = "";
  }

  // must contains {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  Object.entries(vars).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value.toString()); // Ensure value is a string
  });

  return output;
}

async function getMcpSystemPrompt(): Promise<string> {
  const tools = await getAllTools();

  let toolsStr = "";

  tools.forEach((i) => {
    // error client has no tools
    if (!i.tools) return;

    toolsStr += MCP_TOOLS_TEMPLATE.replace(
      "{{ clientId }}",
      i.clientId,
    ).replace(
      "{{ tools }}",
      i.tools.tools.map((p: object) => JSON.stringify(p, null, 2)).join("\n"),
    );
  });

  return MCP_SYSTEM_TEMPLATE.replace("{{ MCP_TOOLS }}", toolsStr);
}

// WebSocket回调函数类型定义
type WebSocketSendCallback = (data: LLMResponseData) => void;

const DEFAULT_CHAT_STATE = {
  sessions: [createEmptySession()],
  currentSessionIndex: 0,
  lastInput: "",
  // WebSocket相关配置
  webSocketCallback: null as WebSocketSendCallback | null,
  webSocketMode: null as SyncMode | null,
};

export const useChatStore = createPersistStore(
  DEFAULT_CHAT_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      forkSession() {
        // 获取当前会话
        const currentSession = get().currentSession();
        if (!currentSession) return;

        const newSession = createEmptySession();

        newSession.topic = currentSession.topic;
        // 深拷贝消息
        newSession.messages = currentSession.messages.map((msg) => ({
          ...msg,
          id: nanoid(), // 生成新的消息 ID
        }));
        newSession.mask = {
          ...currentSession.mask,
          modelConfig: {
            ...currentSession.mask.modelConfig,
          },
        };

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [newSession, ...state.sessions],
        }));
      },

      clearSessions() {
        set(() => ({
          sessions: [createEmptySession()],
          currentSessionIndex: 0,
        }));
      },

      selectSession(index: number) {
        set({
          currentSessionIndex: index,
        });
      },

      moveSession(from: number, to: number) {
        set((state) => {
          const { sessions, currentSessionIndex: oldIndex } = state;

          // move the session
          const newSessions = [...sessions];
          const session = newSessions[from];
          newSessions.splice(from, 1);
          newSessions.splice(to, 0, session);

          // modify current session id
          let newIndex = oldIndex === from ? to : oldIndex;
          if (oldIndex > from && oldIndex <= to) {
            newIndex -= 1;
          } else if (oldIndex < from && oldIndex >= to) {
            newIndex += 1;
          }

          return {
            currentSessionIndex: newIndex,
            sessions: newSessions,
          };
        });
      },

      newSession(mask?: Mask) {
        const session = createEmptySession();

        if (mask) {
          const config = useAppConfig.getState();
          const globalModelConfig = config.modelConfig;

          session.mask = {
            ...mask,
            modelConfig: {
              ...globalModelConfig,
              ...mask.modelConfig,
            },
          };
          session.topic = mask.name;
        }

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [session].concat(state.sessions),
        }));
      },

      nextSession(delta: number) {
        const n = get().sessions.length;
        const limit = (x: number) => (x + n) % n;
        const i = get().currentSessionIndex;
        get().selectSession(limit(i + delta));
      },

      deleteSession(index: number) {
        const deletingLastSession = get().sessions.length === 1;
        const deletedSession = get().sessions.at(index);

        if (!deletedSession) return;

        const sessions = get().sessions.slice();
        sessions.splice(index, 1);

        const currentIndex = get().currentSessionIndex;
        let nextIndex = Math.min(
          currentIndex - Number(index < currentIndex),
          sessions.length - 1,
        );

        if (deletingLastSession) {
          nextIndex = 0;
          sessions.push(createEmptySession());
        }

        // for undo delete action
        const restoreState = {
          currentSessionIndex: get().currentSessionIndex,
          sessions: get().sessions.slice(),
        };

        set(() => ({
          currentSessionIndex: nextIndex,
          sessions,
        }));

        showToast(
          Locale.Home.DeleteToast,
          {
            text: Locale.Home.Revert,
            onClick() {
              set(() => restoreState);
            },
          },
          5000,
        );
      },

      currentSession() {
        let index = get().currentSessionIndex;
        const sessions = get().sessions;

        if (index < 0 || index >= sessions.length) {
          index = Math.min(sessions.length - 1, Math.max(0, index));
          set(() => ({ currentSessionIndex: index }));
        }

        const session = sessions[index];

        return session;
      },

      onNewMessage(message: ChatMessage, targetSession: ChatSession) {
        get().updateTargetSession(targetSession, (session) => {
          session.messages = session.messages.concat();
          session.lastUpdate = Date.now();
        });

        get().updateStat(message, targetSession);

        // get().checkMcpJson(message);
        // TODO: 会报错，暂时注释
        // get().summarizeSession(false, targetSession);
      },

      /**
       * ==================== LLM对话核心处理函数 ====================
       * 
       * 这是整个聊天应用的核心函数，处理用户输入并管理完整的对话工作流程
       * 
       * 🔄 **完整工作流程：**
       * 1. 消息预处理：创建用户消息和bot消息对象
       * 2. MCP指令检测：检测并执行工具指令（如搜索、计算等）
       * 3. LLM分析：调用语言模型进行智能分析
       * 4. 流式输出：实时显示生成内容
       * 5. 状态管理：更新会话状态和UI
       * 
       * 🔧 **MCP闭环设计：**
       * - 工具执行 → 立即显示结果 → LLM分析 → 流式输出最终回答
       * - 提供最佳用户体验：既看到工具数据，又获得AI智能解读
       * 
       * 📊 **流式输出机制：**
       * - 创建统一的botMessage对象，设置streaming: true
       * - 通过streamContent函数模拟MCP工具的流式显示
       * - 通过LLM API的onUpdate回调实现真实的流式输出
       * - 统一的UI更新机制保证流畅的用户体验
       * 
       * @param content 用户输入的文本内容
       * @param attachImages 附加的图片数组（可选）
       * @param isMcpResponse 是否为MCP响应（用于处理MCP工具返回的结果）
       */
      async onUserInput(
        content: string,
        attachImages?: string[],
        isMcpResponse?: boolean,
      ) {
        // ==================== 第一步：会话和配置获取 ====================
        // 获取当前活跃的聊天会话和模型配置
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;

        // ==================== 第二步：多模态内容处理 ====================
        let mContent: string | MultimodalContent[] = content;
        
        // 处理附加图片：将文本和图片组合成多模态内容数组
        // 这里支持Vision模型（如GPT-4V）处理图片+文本的组合输入
        if (!isMcpResponse && attachImages && attachImages.length > 0) {
          mContent = [
            // 如果有文本内容，添加文本对象
            ...(content ? [{ type: "text" as const, text: content }] : []),
            // 将所有图片转换为image_url对象
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        } else if (!isMcpResponse) {
          // 普通文本输入：使用模板系统填充提示词
          // fillTemplateWith会添加系统提示词、时间戳、模型信息等上下文
          mContent = fillTemplateWith(content, modelConfig);
        }

        // ==================== 第三步：消息对象创建 ====================
        // 创建用户消息对象，包含完整的输入内容
        const userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
          isMcpResponse, // 标记是否为MCP工具的响应
        });

        // 创建机器人回复消息对象，初始为空，设置为流式状态
        // 这个对象将被后续的流式输出过程不断更新
        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true, // 🔴 关键：启用流式状态
          model: modelConfig.model,
        });


        // ==================== 第五步：保存消息到会话 ====================
        // 计算消息在数组中的索引，用于后续的控制器管理
        const messageIndex = session.messages.length + 1;
        
        // 同时保存用户消息和初始的空bot消息到会话中
        get().updateTargetSession(session, (session) => {
          session.messages = session.messages.concat([userMessage, botMessage]);
        });
        
        // 更新会话统计信息（字符数等）
        get().updateStat(userMessage, session);

        // ==================== 扣费拦截器 ====================
        // 🔥 关键：在LLM调用前进行扣费检查，失败则终止流程
        if (!isMcpResponse) { // 只对用户主动输入进行扣费，MCP响应不重复扣费
          const billingResult = await get().chargeBilling(modelConfig.model);
          
          if (!billingResult.success) {
            // 扣费失败：更新botMessage显示错误信息，终止流程
            botMessage.streaming = false;
            botMessage.isError = true;
            botMessage.content = `💳 **扣费失败**\n\n${billingResult.message}\n\n${
              billingResult.error === 'USER_NOT_LOGGED_IN' 
                ? '💡 请点击右上角头像进行登录' 
                : '💡 请检查账户余额或联系管理员'
            }`;
            botMessage.date = new Date().toLocaleString();
            
            // 更新会话状态
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            
            // 触发新消息事件
            get().onNewMessage(botMessage, session);
            return; // 🛑 终止流程，不继续LLM调用
          }
          
        }

        await this.executeLLMAnalysis(mContent, botMessage, session, messageIndex);
      },

      /**
       * 
       * @param messageContent 要发送给LLM的消息内容
       * @param botMessage 要更新的机器人消息对象
       * @param session 当前会话对象
       * @param messageIndex 消息在数组中的索引
       */
      async executeLLMAnalysis(
        messageContent: string | MultimodalContent[],
        botMessage: ChatMessage,
        session: ChatSession,
        messageIndex: number,
      ) {
        // ==================== 第一步：配置和API准备 ====================
        const modelConfig = session.mask.modelConfig;
        
        // 创建用于LLM的临时消息对象（不会保存到会话中）
        const llmUserMessage: ChatMessage = createMessage({
          role: "user",
          content: messageContent,
        });

        // ==================== 第二步：上下文准备 ====================
        // 🧠 获取包含记忆系统的完整上下文
        // 这包括：系统提示词、长期记忆、短期记忆、上下文提示词等
        const recentMessages = await get().getMessagesWithMemory();
        
        // 替换最后一条消息为当前要处理的消息
        // 这样可以确保上下文的连续性，同时处理新的用户输入
        const sendMessages = recentMessages.slice(0, -1).concat(llmUserMessage);

        // ==================== 第三步：API客户端获取 ====================

        // ==================== 第四步：API客户端获取 ====================
        // 根据配置的提供商获取对应的API客户端（OpenAI、Anthropic等）
        const api: ClientApi = getClientApi(modelConfig.providerName);
        
        // ==================== 第五步：流式LLM调用 ====================
        // 🚀 发起流式LLM聊天请求
        api.llm.chat({
          messages: sendMessages,           // 发送的完整消息上下文
          config: { ...modelConfig, stream: true }, // 🔴 关键：启用流式输出
          
          // ==================== 流式更新回调 ====================
          /**
           * 📡 实时流式更新回调函数
           * 每当LLM生成新的内容片段时，这个函数就会被调用
           * 这是流式输出的核心机制
           * 
           * @param message 本次更新的内容片段
           */
          onUpdate(message) {
            if (message) {
              // 🔄 处理内容更新逻辑
              // 确保botMessage.content是字符串类型（类型安全）
              const currentContent = typeof botMessage.content === 'string' ? botMessage.content : '';
              
              // 🧹 清理占位文本：如果是第一次更新，清除"分析中..."的占位文本
              if (currentContent.endsWith("分析中...\n\n")) {
                botMessage.content = currentContent.replace(/分析中\.\.\.\n\n$/, "");
              }
              
              // 🎯 智能内容插入：找到最后一个LLM回答的起始位置
              const lastAnalysisIndex = currentContent.lastIndexOf("### 🤖");
              if (lastAnalysisIndex !== -1) {
                // 如果存在分析标题，则在该位置之后更新内容
                const beforeAnalysis = currentContent.substring(0, lastAnalysisIndex);
                botMessage.content = beforeAnalysis + "### 🤖 AI分析\n\n" + message;
              } else {
                // 如果是纯LLM对话（没有MCP工具），直接更新内容
                botMessage.content = message;
              }
              
              // 🌐 WebSocket实时传输：在【监听端】模式下发送LLM输出到【接收端】
              const state = get();
              if (state.webSocketCallback && state.webSocketMode === SyncMode.SENDER) {
                try {
                  const llmData: LLMResponseData = {
                    content: message,
                    isComplete: false, // 流式输出中间状态
                    messageId: botMessage.id || "",
                    sessionId: session.id,
                    timestamp: Date.now(),
                    modelName: session.mask.modelConfig.model,
                  };
                  state.webSocketCallback(llmData);
                } catch (error) {
                  console.warn("[WebSocket] Failed to send LLM output:", error);
                }
              }
            }
            
            // 🔴 关键：触发状态更新，通知React重新渲染
            // 这里使用concat()创建新数组，确保React能检测到状态变化
            get().updateTargetSession(session, (session) => {
              
              session.messages = session.messages.concat();
            });
          },
          
          // ==================== 完成回调 ====================
          /**
           * ✅ 流式输出完成回调函数
           * 当LLM完成所有内容生成时调用
           * 
           * @param message 最终的完整消息内容
           */
          async onFinish(message) {
            // 🏁 结束流式状态
            botMessage.streaming = false;
            
            if (message) {
              // 🔄 确保最终内容正确设置（与onUpdate逻辑一致）
              const currentContent = typeof botMessage.content === 'string' ? botMessage.content : '';
              
              const lastAnalysisIndex = currentContent.lastIndexOf("### 🤖");
              if (lastAnalysisIndex !== -1) {
                const beforeAnalysis = currentContent.substring(0, lastAnalysisIndex);
                botMessage.content = beforeAnalysis + "### 🤖 AI分析\n\n" + message;
              } else {
                botMessage.content = message;
              }
              
              // 🌐 WebSocket结束标记：发送最终完成消息
              const state = get();
              if (state.webSocketCallback && state.webSocketMode === SyncMode.SENDER) {
                try {
                  const finalLlmData: LLMResponseData = {
                    content: message,
                    isComplete: true, // 标记为最终完成状态
                    messageId: botMessage.id || "",
                    sessionId: session.id,
                    timestamp: Date.now(),
                    modelName: session.mask.modelConfig.model,
                  };
                  state.webSocketCallback(finalLlmData);
                } catch (error) {
                  console.warn("[WebSocket] Failed to send final LLM output:", error);
                }
              }
              
              // 📅 设置消息时间戳
              botMessage.date = new Date().toLocaleString();
              
              // 📝 触发新消息事件（用于摘要、统计等）
              get().onNewMessage(botMessage, session);
            }
            
            // 📊 更新会话统计信息
            get().updateStat(botMessage, session);
            
            // 🧹 清理控制器：从控制池中移除已完成的请求
            ChatControllerPool.remove(session.id, botMessage.id);
          },
          
          // ==================== 工具调用处理 ====================
          /**
           * 🔧 工具调用开始前的回调
           * 当LLM决定调用工具时触发（如function calling）
           * 
           * @param tool 工具调用信息
           */
          onBeforeTool(tool: ChatMessageTool) {
            // 📝 将工具信息添加到消息的tools数组中
            (botMessage.tools = botMessage?.tools || []).push(tool);
            
            // 🔧 检测是否为MCP工具并显示执行信息
            if (tool.function?.name && tool.function.name.includes('_')) {
              const toolParts = tool.function.name.split('_');
              if (toolParts.length >= 2) {
                const clientId = toolParts[0];
                const toolName = toolParts.slice(1).join('_');
                
                // 在botMessage中添加MCP工具开始执行的信息
                const mcpStartMessage = `\n\n🔧 **正在执行MCP工具**\n- 客户端：${clientId}\n- 工具：${toolName}\n- 状态：准备中...\n`;
                
                if (typeof botMessage.content === 'string') {
                  botMessage.content += mcpStartMessage;
                } else {
                  botMessage.content = mcpStartMessage;
                }
              }
            }
            
            // 🔄 立即更新UI显示工具调用状态
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          
          /**
           * 🔧 工具调用完成后的回调
           * 当工具执行完成并返回结果时触发
           * 
           * @param tool 更新后的工具信息（包含结果）
           */
          onAfterTool(tool: ChatMessageTool) {
            // 🔄 更新对应工具的状态和结果
            botMessage?.tools?.forEach((t, i, tools) => {
              if (tool.id == t.id) {
                tools[i] = { ...tool }; // 替换为更新后的工具信息
              }
            });
            
            // 🔧 检测MCP工具执行完成并显示详细信息
            if (tool.function?.name && tool.function.name.includes('_') && tool.content) {
              try {
                // 尝试解析工具执行结果，查找MCP执行信息
                let mcpExecutionInfo = null;
                
                // 如果工具内容是JSON字符串，尝试解析
                if (typeof tool.content === 'string') {
                  try {
                    const parsed = JSON.parse(tool.content);
                    mcpExecutionInfo = parsed.mcpExecutionInfo;
                  } catch {
                    // 不是JSON，继续处理
                  }
                }
                
                if (mcpExecutionInfo && mcpExecutionInfo.executionLog) {
                  // 找到MCP执行信息，替换之前的准备中状态
                  const currentContent = typeof botMessage.content === 'string' ? botMessage.content : '';
                  
                  // 查找并替换MCP工具的状态信息
                  const toolParts = tool.function.name.split('_');
                  const clientId = toolParts[0];
                  const toolName = toolParts.slice(1).join('_');
                  
                  const statusPattern = new RegExp(
                    `🔧 \\*\\*正在执行MCP工具\\*\\*\\n- 客户端：${clientId}\\n- 工具：${toolName}\\n- 状态：准备中\\.\\.\\.\\n`,
                    'g'
                  );
                  
                  const executionDetails = `\n\n📋 **MCP工具执行详情**\n\`\`\`\n${mcpExecutionInfo.executionLog}\n\`\`\`\n`;
                  
                  if (statusPattern.test(currentContent)) {
                    // 替换准备中的状态为详细的执行信息
                    botMessage.content = currentContent.replace(statusPattern, executionDetails);
                  } else {
                    // 如果没有找到准备中状态，直接添加执行信息
                    botMessage.content = currentContent + executionDetails;
                  }
                } else {
                  // 没有MCP执行信息但是是MCP工具，显示基本完成信息
                  const toolParts = tool.function.name.split('_');
                  const clientId = toolParts[0];
                  const toolName = toolParts.slice(1).join('_');
                  
                  const currentContent = typeof botMessage.content === 'string' ? botMessage.content : '';
                  const statusPattern = new RegExp(
                    `🔧 \\*\\*正在执行MCP工具\\*\\*\\n- 客户端：${clientId}\\n- 工具：${toolName}\\n- 状态：准备中\\.\\.\\.\\n`,
                    'g'
                  );
                  
                  const completionMessage = `\n\n✅ **MCP工具执行完成**\n- 客户端：${clientId}\n- 工具：${toolName}\n- 状态：已完成\n`;
                  
                  if (statusPattern.test(currentContent)) {
                    botMessage.content = currentContent.replace(statusPattern, completionMessage);
                  } else {
                    botMessage.content = currentContent + completionMessage;
                  }
                }
              } catch (error) {
                console.warn("[MCP Tool Display] Failed to process MCP execution info:", error);
              }
            }
            
            // 🔄 更新UI显示工具执行结果
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          
          // ==================== 错误处理 ====================
          /**
           * ❌ 错误处理回调
           * 当API调用出现错误时触发
           * 
           * @param error 错误对象
           */
          onError(error) {
            // 🔍 检查是否为用户主动取消（abort）
            const isAborted = error.message?.includes?.("aborted");
            
            // 📝 在消息中显示错误信息
            botMessage.content += "\n\n❌ **发生错误**\n\n" + prettyObject({
              error: true,
              message: error.message,
            });
            
            // 🛑 结束流式状态
            botMessage.streaming = false;
            
            // 🚨 设置错误状态（但用户取消不算错误）
            botMessage.isError = !isAborted;
            
            // 🔄 更新UI显示错误信息
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            
            // 📊 更新统计信息
            get().updateStat(botMessage, session);
            
            // 🧹 清理控制器
            ChatControllerPool.remove(session.id, botMessage.id ?? messageIndex);
            
            // 📝 记录错误日志
            console.error("[Chat] failed ", error);
          },
          
          // ==================== 控制器注册 ====================
          /**
           * 🎮 控制器注册回调
           * 用于注册abort控制器，支持用户随时停止生成
           * 
           * @param controller AbortController实例
           */
          onController(controller) {
            // 📝 将控制器注册到全局控制池中
            // 这样用户就可以通过UI停止按钮来中断生成过程
            ChatControllerPool.addController(
              session.id,           // 会话ID
              botMessage.id ?? messageIndex, // 消息ID
              controller,           // 控制器实例
            );
          },
        });
      },

      getMemoryPrompt() {
        const session = get().currentSession();

        if (session.memoryPrompt.length) {
          return {
            role: "system",
            content: Locale.Store.Prompt.History(session.memoryPrompt),
            date: "",
          } as ChatMessage;
        }
      },

      async getMessagesWithMemory() {
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;
        const clearContextIndex = session.clearContextIndex ?? 0;
        const messages = session.messages.slice();
        const totalMessageCount = session.messages.length;

        // in-context prompts
        const contextPrompts = session.mask.context.slice();

        // system prompts, to get close to OpenAI Web ChatGPT
        const shouldInjectSystemPrompts =
          modelConfig.enableInjectSystemPrompts &&
          (session.mask.modelConfig.model.startsWith("gpt-") ||
            session.mask.modelConfig.model.startsWith("chatgpt-"));

        const mcpEnabled = await isMcpEnabled();
        const config = useAppConfig.getState();
        const clientMcpEnabled = config.mcpConfig.enabled;
        const mcpMode = config.mcpConfig.clientMode;
        
        // 客户端MCP控制逻辑
        const shouldUseMcp = mcpEnabled && clientMcpEnabled && mcpMode !== "never";
        
        // 根据模式调整系统提示词
        let mcpSystemPrompt = "";
        if (shouldUseMcp) {
            // 总是模式：使用原始行为（自动调用工具）
            mcpSystemPrompt = (await getMcpSystemPrompt()).replace(
              "{{ USE_MODE }}",
              "ALWAYS"
            );
        }

        var systemPrompts: ChatMessage[] = [];

        if (shouldInjectSystemPrompts) {
          systemPrompts = [
            createMessage({
              role: "system",
              content:
                fillTemplateWith("", {
                  ...modelConfig,
                  template: DEFAULT_SYSTEM_TEMPLATE,
                }) + mcpSystemPrompt,
            }),
          ];
        } else if (shouldUseMcp) {
          systemPrompts = [
            createMessage({
              role: "system",
              content: mcpSystemPrompt,
            }),
          ];
        }

        if (shouldInjectSystemPrompts || mcpEnabled) {
          console.log(
            "[Global System Prompt] ",
            systemPrompts.at(0)?.content ?? "empty",
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        // long term memory
        const shouldSendLongTermMemory =
          modelConfig.sendMemory &&
          session.memoryPrompt &&
          session.memoryPrompt.length > 0 &&
          session.lastSummarizeIndex > clearContextIndex;
        const longTermMemoryPrompts =
          shouldSendLongTermMemory && memoryPrompt ? [memoryPrompt] : [];
        const longTermMemoryStartIndex = session.lastSummarizeIndex;

        // short term memory
        const shortTermMemoryStartIndex = Math.max(
          0,
          totalMessageCount - modelConfig.historyMessageCount,
        );

        // lets concat send messages, including 4 parts:
        // 0. system prompt: to get close to OpenAI Web ChatGPT
        // 1. long term memory: summarized memory messages
        // 2. pre-defined in-context prompts
        // 3. short term memory: latest n messages
        // 4. newest input message
        const memoryStartIndex = shouldSendLongTermMemory
          ? Math.min(longTermMemoryStartIndex, shortTermMemoryStartIndex)
          : shortTermMemoryStartIndex;
        // and if user has cleared history messages, we should exclude the memory too.
        const contextStartIndex = Math.max(clearContextIndex, memoryStartIndex);
        const maxTokenThreshold = modelConfig.max_tokens;

        // get recent messages as much as possible
        const reversedRecentMessages = [];
        for (
          let i = totalMessageCount - 1, tokenCount = 0;
          i >= contextStartIndex && tokenCount < maxTokenThreshold;
          i -= 1
        ) {
          const msg = messages[i];
          if (!msg || msg.isError) continue;
          tokenCount += estimateTokenLength(getMessageTextContent(msg));
          reversedRecentMessages.push(msg);
        }
        // concat all messages
        const recentMessages = [
          ...systemPrompts,
          ...longTermMemoryPrompts,
          ...contextPrompts,
          ...reversedRecentMessages.reverse(),
        ];

        return recentMessages;
      },

      updateMessage(
        sessionIndex: number,
        messageIndex: number,
        updater: (message?: ChatMessage) => void,
      ) {
        const sessions = get().sessions;
        const session = sessions.at(sessionIndex);
        const messages = session?.messages;
        updater(messages?.at(messageIndex));
        set(() => ({ sessions }));
      },

      resetSession(session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.messages = [];
          session.memoryPrompt = "";
        });
      },

      summarizeSession(
        refreshTitle: boolean = false,
        targetSession: ChatSession,
      ) {
        const config = useAppConfig.getState();
        const session = targetSession;
        const modelConfig = session.mask.modelConfig;
        // skip summarize when using dalle3?
        if (isDalle3(modelConfig.model)) {
          return;
        }

        // if not config compressModel, then using getSummarizeModel
        const [model, providerName] = modelConfig.compressModel
          ? [modelConfig.compressModel, modelConfig.compressProviderName]
          : getSummarizeModel(
              session.mask.modelConfig.model,
              session.mask.modelConfig.providerName,
            );
        const api: ClientApi = getClientApi(providerName as ServiceProvider);

        // remove error messages if any
        const messages = session.messages;

        // should summarize topic after chating more than 50 words
        const SUMMARIZE_MIN_LEN = 50;
        if (
          (config.enableAutoGenerateTitle &&
            session.topic === DEFAULT_TOPIC &&
            countMessages(messages) >= SUMMARIZE_MIN_LEN) ||
          refreshTitle
        ) {
          const startIndex = Math.max(
            0,
            messages.length - modelConfig.historyMessageCount,
          );
          const topicMessages = messages
            .slice(
              startIndex < messages.length ? startIndex : messages.length - 1,
              messages.length,
            )
            .concat(
              createMessage({
                role: "user",
                content: Locale.Store.Prompt.Topic,
              }),
            );
          api.llm.chat({
            messages: topicMessages,
            config: {
              model,
              stream: false,
              providerName,
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                get().updateTargetSession(
                  session,
                  (session) =>
                    (session.topic =
                      message.length > 0 ? trimTopic(message) : DEFAULT_TOPIC),
                );
              }
            },
          });
        }
        const summarizeIndex = Math.max(
          session.lastSummarizeIndex,
          session.clearContextIndex ?? 0,
        );
        let toBeSummarizedMsgs = messages
          .filter((msg) => !msg.isError)
          .slice(summarizeIndex);

        const historyMsgLength = countMessages(toBeSummarizedMsgs);

        if (historyMsgLength > (modelConfig?.max_tokens || 4000)) {
          const n = toBeSummarizedMsgs.length;
          toBeSummarizedMsgs = toBeSummarizedMsgs.slice(
            Math.max(0, n - modelConfig.historyMessageCount),
          );
        }
        const memoryPrompt = get().getMemoryPrompt();
        if (memoryPrompt) {
          // add memory prompt
          toBeSummarizedMsgs.unshift(memoryPrompt);
        }

        const lastSummarizeIndex = session.messages.length;

        console.log(
          "[Chat History] ",
          toBeSummarizedMsgs,
          historyMsgLength,
          modelConfig.compressMessageLengthThreshold,
        );

        if (
          historyMsgLength > modelConfig.compressMessageLengthThreshold &&
          modelConfig.sendMemory
        ) {
          /** Destruct max_tokens while summarizing
           * this param is just shit
           **/
          const { max_tokens, ...modelcfg } = modelConfig;
          api.llm.chat({
            messages: toBeSummarizedMsgs.concat(
              createMessage({
                role: "system",
                content: Locale.Store.Prompt.Summarize,
                date: "",
              }),
            ),
            config: {
              ...modelcfg,
              stream: true,
              model,
              providerName,
            },
            onUpdate(message) {
              session.memoryPrompt = message;
            },
            onFinish(message, responseRes) {
              if (responseRes?.status === 200) {
                console.log("[Memory] ", message);
                get().updateTargetSession(session, (session) => {
                  session.lastSummarizeIndex = lastSummarizeIndex;
                  session.memoryPrompt = message; // Update the memory prompt for stored it in local storage
                });
              }
            },
            onError(err) {
              console.error("[Summarize] ", err);
            },
          });
        }
      },

      updateStat(message: ChatMessage, session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.stat.charCount += message.content.length;
          // TODO: should update chat count and word count
        });
      },
      updateTargetSession(
        targetSession: ChatSession,
        updater: (session: ChatSession) => void,
      ) {
        const sessions = get().sessions;
        const index = sessions.findIndex((s) => s.id === targetSession.id);
        if (index < 0) return;
        updater(sessions[index]);
        set(() => ({ sessions }));
      },
      async clearAllData() {
        await indexedDBStorage.clear();
        localStorage.clear();
        location.reload();
      },
      setLastInput(lastInput: string) {
        set({
          lastInput,
        });
      },

      /** 
       * 设置WebSocket回调函数和模式
       * 用于在【监听端】模式下发送LLM输出到【接收端】
       */
      setWebSocketCallback(callback: WebSocketSendCallback | null, mode: SyncMode | null) {
        set({
          webSocketCallback: callback,
          webSocketMode: mode,
        });
      },

      /**
       * 扣费方法
       * 根据模型类型进行扣费
       */
      async chargeBilling(modelName: string): Promise<BillingResult> {
        try {
          return await billingService.chargeForChat(modelName);
        } catch (error) {
          console.error('[Chat Store] Billing failed:', error);
          return {
            success: false,
            message: '扣费服务异常，请稍后重试',
            error: error instanceof Error ? error.message : '未知错误',
          };
        }
      },

      /** check if the message contains MCP JSON and execute the MCP action */
      // checkMcpJson(message: ChatMessage) {
      //   const mcpEnabled = isMcpEnabled();
      //   if (!mcpEnabled) return;
      //   const content = getMessageTextContent(message);
      //   if (isMcpJson(content)) {
      //     try {
      //       const mcpRequest = extractMcpJson(content);
      //       if (mcpRequest) {
      //         console.debug("[MCP Request]", mcpRequest);

      //         executeMcpAction(mcpRequest.clientId, mcpRequest.mcp)
      //           .then((result: any) => {
      //             console.log("[MCP Response]", result);
      //             const mcpResponse =
      //               typeof result === "object"
      //                 ? JSON.stringify(result)
      //                 : String(result);
      //             get().onUserInput(
      //               `\`\`\`json:mcp-response:${mcpRequest.clientId}\n${mcpResponse}\n\`\`\``,
      //               [],
      //               true,
      //             );
      //           })
      //           .catch((error: any) => showToast("MCP execution failed", error));
      //       }
      //     } catch (error) {
      //       console.error("[Check MCP JSON]", error);
      //     }
      //   }
      // },

      /** 
       * 检测并执行直接指令
       * 
       * @param userInput 用户输入的原始文本
       * @returns McpCommandResult 包含执行结果和继续处理信息的对象
       */
      // async detectAndExecuteCommand(userInput: string): Promise<McpCommandResult> {
      //   const mcpEnabled = await isMcpEnabled();
        
      //   // 如果MCP未启用，返回未执行状态
      //   if (!mcpEnabled) {
      //     return {
      //       executed: false,
      //       shouldContinueToLLM: false,
      //       originalIntent: userInput
      //     };
      //   }

      //   const command = detectCommand(userInput);
        
      //   // 如果没有检测到指令，返回未执行状态
      //   if (!command) {
      //     return {
      //       executed: false,
      //       shouldContinueToLLM: false,
      //       originalIntent: userInput
      //     };
      //   }

      //   try {
      //     console.debug("[Direct MCP Command]", command);
      //     console.debug("[Direct MCP Command] Client ID:", command.clientId);
      //     console.debug("[Direct MCP Command] Tool Name:", command.toolName);

      //     const args = command.buildArgs ? command.buildArgs(userInput) : {};
      //     console.debug("[Direct MCP Command] Built Args:", args);
          
      //     // 验证参数中是否包含错误信息
      //     if ('error' in args && args.error) {
      //       const errorResult = `❌ **${command.description}** 参数错误\n\n${args.error}`;
      //       return {
      //         executed: true,
      //         result: errorResult,
      //         shouldContinueToLLM: false, // 参数错误直接返回，不继续LLM
      //         originalIntent: userInput,
      //         command,
      //       };
      //     }
          
      //     // 构造MCP请求
      //     const mcpRequest: McpRequestMessage = {
      //       jsonrpc: "2.0" as const,
      //       id: Date.now(),
      //       method: "tools/call" as const,
      //       params: {
      //         name: command.toolName,
      //         arguments: args
      //       }
      //     };
          
      //     console.debug("[Direct MCP Command] Full Request:", mcpRequest);

      //     // 执行MCP请求
      //     const result = await executeMcpAction(command.clientId, mcpRequest);
      //     console.log("[Direct MCP Response]", result);

      //     const resultText = typeof result === "object" 
      //       ? JSON.stringify(result, null, 2) 
      //       : String(result);
          
      //     // 根据命令配置决定处理方式 - 默认继续到LLM
      //     const shouldContinue = command.continueToLLM ?? true;
          
      //     let enhancedPrompt: string | undefined;
          
      //     // 如果需要继续传递给LLM，构造增强提示词
      //     if (shouldContinue && command.resultTemplate) {
      //       enhancedPrompt = command.resultTemplate
      //         .replace('{{mcpResult}}', resultText)
      //         .replace('{{originalQuery}}', userInput);
      //     }
          
      //     const directDisplayResult = `🤖 **${command.description}**\n\n${resultText}`;
          
      //     return {
      //       executed: true,
      //       result: directDisplayResult,
      //       shouldContinueToLLM: shouldContinue,
      //       originalIntent: userInput,
      //       enhancedPrompt,
      //       command,
      //     };
          
      //   } catch (error: any) {
      //     // 详细错误日志记录
      //     console.error("[Direct MCP Command Error] Full Error Object:", error);
      //     console.error("[Direct MCP Command Error] Error Name:", error?.name);
      //     console.error("[Direct MCP Command Error] Error Message:", error?.message);
      //     console.error("[Direct MCP Command Error] Error Stack:", error?.stack);
          
      //     // 如果是网络错误，尝试获取更多信息
      //     if (error?.response) {
      //       console.error("[Direct MCP Command Error] Response Status:", error.response.status);
      //       console.error("[Direct MCP Command Error] Response Data:", error.response.data);
      //       console.error("[Direct MCP Command Error] Response Headers:", error.response.headers);
      //     }
          
      //     // 如果是 MCP 协议错误
      //     if (error?.code) {
      //       console.error("[Direct MCP Command Error] MCP Error Code:", error.code);
      //     }

      //     const errorMessage = error?.message || String(error);
      //     showToast("MCP指令执行失败: " + errorMessage);
          
      //     const errorResult = `❌ **${command.description}** 执行失败\n\n**错误详情:**\n- 错误类型: ${error?.name || 'Unknown'}\n- 错误消息: ${errorMessage}\n- 客户端: ${command.clientId}\n- 工具: ${command.toolName}\n\n💡 **调试提示:** 请查看浏览器控制台获取详细错误信息`;
          
      //     return {
      //       executed: true,
      //       result: errorResult,
      //       shouldContinueToLLM: false, // 错误情况下不继续
      //       originalIntent: userInput,
      //       command,
      //     };
      //   }
      // },
    };

    return methods;
  },
  {
    name: StoreKey.Chat,
    version: 3.3,
    migrate(persistedState, version) {
      const state = persistedState as any;
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_CHAT_STATE;

      if (version < 2) {
        newState.sessions = [];

        const oldSessions = state.sessions;
        for (const oldSession of oldSessions) {
          const newSession = createEmptySession();
          newSession.topic = oldSession.topic;
          newSession.messages = [...oldSession.messages];
          newSession.mask.modelConfig.sendMemory = true;
          newSession.mask.modelConfig.historyMessageCount = 4;
          newSession.mask.modelConfig.compressMessageLengthThreshold = 1000;
          newState.sessions.push(newSession);
        }
      }

      if (version < 3) {
        // migrate id to nanoid
        newState.sessions.forEach((s) => {
          s.id = nanoid();
          s.messages.forEach((m) => (m.id = nanoid()));
        });
      }

      // Enable `enableInjectSystemPrompts` attribute for old sessions.
      // Resolve issue of old sessions not automatically enabling.
      if (version < 3.1) {
        newState.sessions.forEach((s) => {
          if (
            // Exclude those already set by user
            !s.mask.modelConfig.hasOwnProperty("enableInjectSystemPrompts")
          ) {
            // Because users may have changed this configuration,
            // the user's current configuration is used instead of the default
            const config = useAppConfig.getState();
            s.mask.modelConfig.enableInjectSystemPrompts =
              config.modelConfig.enableInjectSystemPrompts;
          }
        });
      }

      // add default summarize model for every session
      if (version < 3.2) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = config.modelConfig.compressModel;
          s.mask.modelConfig.compressProviderName =
            config.modelConfig.compressProviderName;
        });
      }
      // revert default summarize model for every session
      if (version < 3.3) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = "";
          s.mask.modelConfig.compressProviderName = "";
        });
      }

      return newState as any;
    },
  },
);
