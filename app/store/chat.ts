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
import { executeMcpAction, getAllTools, isMcpEnabled } from "../mcp/actions";
import { extractMcpJson, isMcpJson } from "../mcp/utils";
import { detectCommand, CommandMapping } from "../mcp/command-mapping";
import { McpRequestMessage } from "../mcp/types";
import { MultiCommandResult, multiCommandExecutor } from "../mcp/multi-command";

/**
 * ========================= MCP-LLM 闭环工作流程说明 =========================
 * 
 * ## 概述
 * 本文件实现了 MCP (Model Context Protocol) 工具与 LLM 的闭环集成，
 * 工作流程：MCP工具执行 → 立即显示结果 → LLM分析 → 流式输出。
 * 
 * ## 工作流程
 * 
 * ### 1. 用户输入阶段
 * - 用户输入："搜索一下最新的AI技术发展"
 * - 系统检测到这是一个MCP指令（tavily-search）
 * 
 * ### 2. MCP工具执行阶段
 * - 执行 tavily-search 工具获取搜索结果
 * - **立即显示工具结果给用户**
 * 
 * ### 3. LLM分析阶段
 * - 使用 resultTemplate 构造增强提示词
 * - 将工具结果注入到LLM的上下文中
 * - LLM基于工具结果生成智能回答
 * 
 * ### 4. 结果展示阶段
 * - 用户先看到MCP工具的执行结果
 * - 然后看到LLM基于工具结果的流式分析
 * - 两个消息分别显示，清晰明了
 * 
 * ## 默认行为
 * 
 * - `shouldContinueToLLM` 默认为 true
 * - 所有MCP工具都会继续传递给LLM进行分析
 * - 提供最佳的用户体验：工具结果 + AI智能解读
 * 
 * ## 配置示例
 * ```typescript
 * {
 *   keywords: ["搜索", "search"],
 *   clientId: "tavily-mcp",
 *   toolName: "tavily-search", 
 *   continueToLLM: true, // 可省略，默认为true
 *   resultTemplate: "基于以下搜索结果：{{mcpResult}}\\n\\n用户问题：{{originalQuery}}"
 * }
 * ```
 */

// ==================== MCP-LLM闭环类型定义 ====================
interface McpCommandResult {
  executed: boolean;           // 是否成功执行了MCP指令
  result?: string;            // MCP工具的执行结果（原始数据）
  shouldContinueToLLM: boolean; // 是否应该继续传递给LLM
  originalIntent: string;     // 用户的原始意图/查询
  enhancedPrompt?: string;    // 增强后的提示词（包含工具结果作为上下文）
  command?: CommandMapping;   // 执行的命令配置信息
}

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

const DEFAULT_CHAT_STATE = {
  sessions: [createEmptySession()],
  currentSessionIndex: 0,
  lastInput: "",
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
       * 处理用户输入的核心函数 - 优化版本
       * 
       * @param content 用户输入的文本内容
       * @param attachImages 附加的图片数组（可选）
       * @param isMcpResponse 是否为MCP响应（用于处理MCP工具返回的结果）
       * 
       * 主要流程：
       * 1. 获取当前会话和模型配置
       * 2. 创建用户消息和统一的流式bot消息
       * 3. MCP指令检测和流式执行
       * 4. LLM分析流式追加到同一消息
       */
      async onUserInput(
        content: string,
        attachImages?: string[],
        isMcpResponse?: boolean,
      ) {
        // ==================== 第一步：获取会话和配置 ====================
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;

        // ==================== 第二步：创建统一的消息对象 ====================
        let mContent: string | MultimodalContent[] = content;
        
        // 处理附加图片：将文本和图片组合成多模态内容
        if (!isMcpResponse && attachImages && attachImages.length > 0) {
          mContent = [
            ...(content ? [{ type: "text" as const, text: content }] : []),
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        } else if (!isMcpResponse) {
          // 正常情况：使用常规模板填充
          mContent = fillTemplateWith(content, modelConfig);
        }

        // 创建用户消息
        const userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
          isMcpResponse,
        });

        // 创建统一的流式bot消息
        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: modelConfig.model,
        });

        // 统一的流式内容追加函数
        const streamContent = async (text: string, delay: number = 50): Promise<void> => {
          return new Promise((resolve) => {
            setTimeout(() => {
              botMessage.content += text;
              get().updateTargetSession(session, (session) => {
                session.messages = session.messages.concat();
              });
              resolve();
            }, delay);
          });
        };

        // 保存用户消息和初始bot消息到会话中
        const messageIndex = session.messages.length + 1;
        get().updateTargetSession(session, (session) => {
          session.messages = session.messages.concat([userMessage, botMessage]);
        });
        get().updateStat(userMessage, session);

        // ==================== 第三步：MCP指令检测和流式执行 ====================
        if (!isMcpResponse) {
          // 首先检测是否为复合指令
          const multiCommandResult = await multiCommandExecutor.executeCommandChain(content);
          
          if (multiCommandResult.executed) {
            // 流式显示复合指令执行过程
            await streamContent("🔧 **多工具执行模式**\n\n", 100);
            
            for (let i = 0; i < multiCommandResult.results.length; i++) {
              const result = multiCommandResult.results[i];
              const toolName = result.command?.description || `工具${i + 1}`;
              
              await streamContent(`### 🔨 ${toolName}\n`, 100);
              await streamContent("执行中...\n\n", 200);
              await streamContent(`${result.result || "执行完成"}\n\n---\n\n`, 300);
            }
            
            // 如果需要继续到LLM分析
            if (multiCommandResult.shouldContinueToLLM && multiCommandResult.enhancedPrompt) {
              await streamContent("### 🤖 AI综合分析\n\n", 200);
              await streamContent("分析中...\n\n", 300);
              
              // 继续LLM分析流程
              const enhancedContent = fillTemplateWith(multiCommandResult.enhancedPrompt, modelConfig);
              await this.executeLLMAnalysis(enhancedContent, botMessage, session, messageIndex);
            } else {
              // 多命令执行完成
              botMessage.streaming = false;
              botMessage.date = new Date().toLocaleString();
              get().updateStat(botMessage, session);
            }
            return;
          } else {
            // 尝试单指令检测
            const mcpCommandResult = await get().detectAndExecuteCommand(content);
            
            if (mcpCommandResult.executed) {
              // 流式显示单指令执行过程
              const toolName = mcpCommandResult.command?.description || "MCP工具";
              await streamContent(`### 🔨 ${toolName}\n\n`, 100);
              await streamContent("执行中...\n\n", 200);
              await streamContent(`${mcpCommandResult.result || "执行完成"}\n\n`, 300);
              
              // 如果需要继续到LLM分析
              if (mcpCommandResult.shouldContinueToLLM && mcpCommandResult.enhancedPrompt) {
                await streamContent("---\n\n### 🤖 AI分析\n\n", 200);
                await streamContent("分析中...\n\n", 300);
                
                // 继续LLM分析流程
                const enhancedContent = fillTemplateWith(mcpCommandResult.enhancedPrompt, modelConfig);
                await this.executeLLMAnalysis(enhancedContent, botMessage, session, messageIndex);
              } else {
                // 单指令执行完成
                botMessage.streaming = false;
                botMessage.date = new Date().toLocaleString();
                get().updateStat(botMessage, session);
              }
              return;
            }
          }
        }

        // ==================== 第四步：常规LLM对话流程 ====================
        await this.executeLLMAnalysis(mContent, botMessage, session, messageIndex);
      },

      /**
       * 执行LLM分析的辅助函数
       */
      async executeLLMAnalysis(
        messageContent: string | MultimodalContent[],
        botMessage: ChatMessage,
        session: ChatSession,
        messageIndex: number,
      ) {
        const modelConfig = session.mask.modelConfig;
        
        // 创建用于LLM的消息
        const llmUserMessage: ChatMessage = createMessage({
          role: "user",
          content: messageContent,
        });

        // 获取包含记忆的最近消息
        const recentMessages = await get().getMessagesWithMemory();
        const sendMessages = recentMessages.slice(0, -1).concat(llmUserMessage); // 替换最后一条消息

        const api: ClientApi = getClientApi(modelConfig.providerName);
        
        // 发起LLM聊天请求
        api.llm.chat({
          messages: sendMessages,
          config: { ...modelConfig, stream: true },
          
          // 流式更新回调：追加LLM生成的内容
          onUpdate(message) {
            if (message) {
              // 确保botMessage.content是字符串类型
              const currentContent = typeof botMessage.content === 'string' ? botMessage.content : '';
              
              // 如果是第一次更新，清除"分析中..."的占位文本
              if (currentContent.endsWith("分析中...\n\n")) {
                botMessage.content = currentContent.replace(/分析中\.\.\.\n\n$/, "");
              }
              
              // 找到最后一个LLM回答的起始位置
              const lastAnalysisIndex = currentContent.lastIndexOf("### 🤖");
              if (lastAnalysisIndex !== -1) {
                const beforeAnalysis = currentContent.substring(0, lastAnalysisIndex);
                botMessage.content = beforeAnalysis + "### 🤖 AI分析\n\n" + message;
              } else {
                botMessage.content = message;
              }
            }
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          
          // 完成回调
          async onFinish(message) {
            botMessage.streaming = false;
            if (message) {
              // 确保botMessage.content是字符串类型
              const currentContent = typeof botMessage.content === 'string' ? botMessage.content : '';
              
              // 确保最终内容正确设置
              const lastAnalysisIndex = currentContent.lastIndexOf("### 🤖");
              if (lastAnalysisIndex !== -1) {
                const beforeAnalysis = currentContent.substring(0, lastAnalysisIndex);
                botMessage.content = beforeAnalysis + "### 🤖 AI分析\n\n" + message;
              } else {
                botMessage.content = message;
              }
              botMessage.date = new Date().toLocaleString();
              get().onNewMessage(botMessage, session);
            }
            get().updateStat(botMessage, session);
            ChatControllerPool.remove(session.id, botMessage.id);
          },
          
          // 工具调用处理
          onBeforeTool(tool: ChatMessageTool) {
            (botMessage.tools = botMessage?.tools || []).push(tool);
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          
          onAfterTool(tool: ChatMessageTool) {
            botMessage?.tools?.forEach((t, i, tools) => {
              if (tool.id == t.id) {
                tools[i] = { ...tool };
              }
            });
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          
          // 错误处理
          onError(error) {
            const isAborted = error.message?.includes?.("aborted");
            botMessage.content += "\n\n❌ **发生错误**\n\n" + prettyObject({
              error: true,
              message: error.message,
            });
            botMessage.streaming = false;
            botMessage.isError = !isAborted;
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            get().updateStat(botMessage, session);
            ChatControllerPool.remove(session.id, botMessage.id ?? messageIndex);
            console.error("[Chat] failed ", error);
          },
          
          // 控制器处理
          onController(controller) {
            ChatControllerPool.addController(
              session.id,
              botMessage.id ?? messageIndex,
              controller,
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
        const mcpSystemPrompt = mcpEnabled ? await getMcpSystemPrompt() : "";

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
        } else if (mcpEnabled) {
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

      /** check if the message contains MCP JSON and execute the MCP action */
      checkMcpJson(message: ChatMessage) {
        const mcpEnabled = isMcpEnabled();
        if (!mcpEnabled) return;
        const content = getMessageTextContent(message);
        if (isMcpJson(content)) {
          try {
            const mcpRequest = extractMcpJson(content);
            if (mcpRequest) {
              console.debug("[MCP Request]", mcpRequest);

              executeMcpAction(mcpRequest.clientId, mcpRequest.mcp)
                .then((result: any) => {
                  console.log("[MCP Response]", result);
                  const mcpResponse =
                    typeof result === "object"
                      ? JSON.stringify(result)
                      : String(result);
                  get().onUserInput(
                    `\`\`\`json:mcp-response:${mcpRequest.clientId}\n${mcpResponse}\n\`\`\``,
                    [],
                    true,
                  );
                })
                .catch((error: any) => showToast("MCP execution failed", error));
            }
          } catch (error) {
            console.error("[Check MCP JSON]", error);
          }
        }
      },

      /** 
       * 检测并执行直接指令
       * 
       * @param userInput 用户输入的原始文本
       * @returns McpCommandResult 包含执行结果和继续处理信息的对象
       */
      async detectAndExecuteCommand(userInput: string): Promise<McpCommandResult> {
        const mcpEnabled = await isMcpEnabled();
        
        // 如果MCP未启用，返回未执行状态
        if (!mcpEnabled) {
          return {
            executed: false,
            shouldContinueToLLM: false,
            originalIntent: userInput
          };
        }

        const command = detectCommand(userInput);
        
        // 如果没有检测到指令，返回未执行状态
        if (!command) {
          return {
            executed: false,
            shouldContinueToLLM: false,
            originalIntent: userInput
          };
        }

        try {
          console.debug("[Direct MCP Command]", command);
          console.debug("[Direct MCP Command] Client ID:", command.clientId);
          console.debug("[Direct MCP Command] Tool Name:", command.toolName);

          const args = command.buildArgs ? command.buildArgs(userInput) : {};
          console.debug("[Direct MCP Command] Built Args:", args);
          
          // 验证参数中是否包含错误信息
          if ('error' in args && args.error) {
            const errorResult = `❌ **${command.description}** 参数错误\n\n${args.error}`;
            return {
              executed: true,
              result: errorResult,
              shouldContinueToLLM: false, // 参数错误直接返回，不继续LLM
              originalIntent: userInput,
              command,
            };
          }
          
          // 构造MCP请求
          const mcpRequest: McpRequestMessage = {
            jsonrpc: "2.0" as const,
            id: Date.now(),
            method: "tools/call" as const,
            params: {
              name: command.toolName,
              arguments: args
            }
          };
          
          console.debug("[Direct MCP Command] Full Request:", mcpRequest);

          // 执行MCP请求
          const result = await executeMcpAction(command.clientId, mcpRequest);
          console.log("[Direct MCP Response]", result);

          const resultText = typeof result === "object" 
            ? JSON.stringify(result, null, 2) 
            : String(result);
          
          // 根据命令配置决定处理方式 - 默认继续到LLM
          const shouldContinue = command.continueToLLM ?? true;
          
          let enhancedPrompt: string | undefined;
          
          // 如果需要继续传递给LLM，构造增强提示词
          if (shouldContinue && command.resultTemplate) {
            enhancedPrompt = command.resultTemplate
              .replace('{{mcpResult}}', resultText)
              .replace('{{originalQuery}}', userInput);
          }
          
          const directDisplayResult = `🤖 **${command.description}**\n\n${resultText}`;
          
          return {
            executed: true,
            result: directDisplayResult,
            shouldContinueToLLM: shouldContinue,
            originalIntent: userInput,
            enhancedPrompt,
            command,
          };
          
        } catch (error: any) {
          // 详细错误日志记录
          console.error("[Direct MCP Command Error] Full Error Object:", error);
          console.error("[Direct MCP Command Error] Error Name:", error?.name);
          console.error("[Direct MCP Command Error] Error Message:", error?.message);
          console.error("[Direct MCP Command Error] Error Stack:", error?.stack);
          
          // 如果是网络错误，尝试获取更多信息
          if (error?.response) {
            console.error("[Direct MCP Command Error] Response Status:", error.response.status);
            console.error("[Direct MCP Command Error] Response Data:", error.response.data);
            console.error("[Direct MCP Command Error] Response Headers:", error.response.headers);
          }
          
          // 如果是 MCP 协议错误
          if (error?.code) {
            console.error("[Direct MCP Command Error] MCP Error Code:", error.code);
          }

          const errorMessage = error?.message || String(error);
          showToast("MCP指令执行失败: " + errorMessage);
          
          const errorResult = `❌ **${command.description}** 执行失败\n\n**错误详情:**\n- 错误类型: ${error?.name || 'Unknown'}\n- 错误消息: ${errorMessage}\n- 客户端: ${command.clientId}\n- 工具: ${command.toolName}\n\n💡 **调试提示:** 请查看浏览器控制台获取详细错误信息`;
          
          return {
            executed: true,
            result: errorResult,
            shouldContinueToLLM: false, // 错误情况下不继续
            originalIntent: userInput,
            command,
          };
        }
      },
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
