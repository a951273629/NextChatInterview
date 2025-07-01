import { useChatStore, ChatMessage, createMessage } from "@/app/store/chat";
import { LLMResponseData } from "@/app/types/websocket-sync";

/**
 * 面试聊天功能 Hook
 * 
 * 基于主 chatStore 提供面试特定的功能，不创建独立的状态管理
 * 完全复用主系统的会话管理、消息处理等功能
 */
export const useInterviewChat = () => {
  const chatStore = useChatStore();

  /**
   * 根据 sessionId 查找会话，如果没找到则使用第一个会话
   * @param sessionId 会话ID
   * @returns ChatSession 实例
   */
  const findOrCreateSessionById = (sessionId: string) => {
    // 先查找是否已存在对应的会话
    const existingSession = chatStore.sessions.find(s => s.id === sessionId);
    if (existingSession) {
      console.log("📝 找到现有面试会话:", sessionId);
      return existingSession;
    }

    // 没找到指定 session，使用第一个 session 或当前 session
    const fallbackSession = chatStore.sessions[0] || chatStore.currentSession();
    console.log("📝 未找到指定会话，使用第一个会话:", fallbackSession.id);
    
    return fallbackSession;
  };

  /**
   * 处理 LLM 响应（从原 onLLMResponse 抽取的核心逻辑）
   * @param data LLM响应数据
   */
  const handleLLMResponse = (data: LLMResponseData) => {
    console.log("🤖 处理LLM响应:", {
      messageId: data.messageId,
      sessionId: data.sessionId,
      isComplete: data.isComplete,
      contentLength: data.content.length,
    });

    // 查找或创建目标会话
    const targetSession = findOrCreateSessionById(data.sessionId);

    // 使用主系统的会话更新方法处理 assistant 消息
    chatStore.updateTargetSession(targetSession, (session) => {
      let assistantMessage = session.messages.find(msg => 
        msg.id === data.messageId && msg.role === "assistant"
      );

      if (!assistantMessage) {
        // 创建新的 assistant 消息
        assistantMessage = createMessage({
          id: data.messageId,
          role: "assistant",
          content: data.content,
          date: new Date(data.timestamp || Date.now()).toISOString(),
          streaming: !data.isComplete,
          isError: false,
          model: data.modelName,
        }) as ChatMessage;
        
        session.messages.push(assistantMessage);
        console.log(`📝 创建新assistant消息: ${data.messageId}`);
      } else {
        // 更新现有消息内容（流式输出）
        assistantMessage.content = data.content;
        assistantMessage.streaming = !data.isComplete;
        console.log(`🔄 更新assistant消息: ${data.messageId}, 完成状态: ${data.isComplete}`);
      }

      // 更新session时间戳
      session.lastUpdate = Date.now();
      // 更新session消息
      session.messages = session.messages.concat();
    });

    console.log(`✅ LLM回答已处理完成: session=${data.sessionId}, message=${data.messageId}`);
  };

  /**
   * 获取当前面试会话
   * 如果需要特定的面试会话，可以通过 sessionId 查找
   */
  const getCurrentInterviewSession = (sessionId?: string) => {
    if (sessionId) {
      return findOrCreateSessionById(sessionId);
    }
    return chatStore.currentSession();
  };

  // 返回面试相关的功能接口
  return {
    // 核心功能
    handleLLMResponse,
    findOrCreateSessionById,
    getCurrentInterviewSession,
    
    // 直接暴露主 chatStore 的相关功能
    currentSession: chatStore.currentSession,
    sessions: chatStore.sessions,
    updateSession: chatStore.updateTargetSession,
    newSession: chatStore.newSession,
  };
}; 