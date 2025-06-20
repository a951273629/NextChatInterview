import { CommandMapping, detectCommand } from "./command-mapping";
import { executeMcpAction } from "./actions";
import { McpRequestMessage } from "./types";

// ==================== 多命令执行相关类型定义 ====================
export interface MultiCommandResult {
  executed: boolean;
  commands: CommandMapping[];
  results: McpCommandResult[];
  shouldContinueToLLM: boolean;
  combinedResult: string;
  originalIntent: string;
  enhancedPrompt?: string;  // 增强提示词，用于传递给LLM
}

export interface McpCommandResult {
  executed: boolean;
  result?: string;
  shouldContinueToLLM: boolean;
  originalIntent: string;
  enhancedPrompt?: string;
  command?: CommandMapping;
}

export interface CompoundPattern {
  pattern: RegExp;
  commands: string[];
  extractArgs: (matches: RegExpMatchArray) => string[];
  description: string;
}

export interface ThinkingState {
  currentStep: number;
  totalSteps: number;
  results: string[];
  isComplete: boolean;
  originalQuery: string;
}

// ==================== 复合指令模式定义 ====================
export const COMPOUND_PATTERNS: CompoundPattern[] = [
  {
    pattern: /搜索(一下)?[""""']([^""""']+)[""""'][，,]\s*然后思考(一下)?[""""']([^""""']+)[""""']/,
    commands: ['tavily-search', 'sequential-thinking'],
    extractArgs: (matches) => [matches[2], matches[4]],
    description: "搜索后进行深度思考"
  },
  {
    pattern: /搜索(.+?)然后思考(.+)/,
    commands: ['tavily-search', 'sequential-thinking'],
    extractArgs: (matches) => [matches[1].trim(), matches[2].trim()],
    description: "搜索后进行深度思考"
  },
  {
    pattern: /查找(.+?)然后分析(.+)/,
    commands: ['tavily-search', 'sequential-thinking'],
    extractArgs: (matches) => [matches[1].trim(), matches[2].trim()],
    description: "查找信息后进行分析"
  }
];

// ==================== 多命令执行器类 ====================
export class MultiCommandExecutor {
  
  /**
   * 检测用户输入是否为复合指令
   */
  detectMultipleCommands(userInput: string): { pattern: CompoundPattern; args: string[] } | null {
    for (const pattern of COMPOUND_PATTERNS) {
      const matches = userInput.match(pattern.pattern);
      if (matches) {
        const args = pattern.extractArgs(matches);
        return { pattern, args };
      }
    }
    return null;
  }

  /**
   * 执行单个MCP命令
   */
  async executeSingleCommand(command: CommandMapping, userInput: string): Promise<McpCommandResult> {
    try {
      console.debug("[Multi-Command] Executing single command:", command.toolName);

      const args = command.buildArgs ? command.buildArgs(userInput) : {};
      console.debug("[Multi-Command] Built args:", args);
      
      // 验证参数中是否包含错误信息
      if ('error' in args && args.error) {
        const errorResult = `❌ **${command.description}** 参数错误\n\n${args.error}`;
        return {
          executed: true,
          result: errorResult,
          shouldContinueToLLM: false,
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

      // 执行MCP请求
      const result = await executeMcpAction(command.clientId, mcpRequest);
      console.log("[Multi-Command] Response:", result);

      const resultText = typeof result === "object" 
        ? JSON.stringify(result, null, 2) 
        : String(result);
      
      const shouldContinue = command.continueToLLM ?? true;
      
      let enhancedPrompt: string | undefined;
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
      console.error("[Multi-Command] Error executing command:", error);
      
      const errorMessage = error?.message || String(error);
      const errorResult = `❌ **${command.description}** 执行失败\n\n**错误详情:**\n- 错误消息: ${errorMessage}\n- 客户端: ${command.clientId}\n- 工具: ${command.toolName}`;
      
      return {
        executed: true,
        result: errorResult,
        shouldContinueToLLM: false,
        originalIntent: userInput,
        command,
      };
    }
  }

  /**
   * 执行Sequential Thinking的多轮调用
   */
  async executeSequentialThinking(query: string, searchResult?: string): Promise<string[]> {
    const results: string[] = [];
    const totalThoughts = 5;
    
    console.debug("[Multi-Command] Starting Sequential Thinking with 5 rounds");
    
    // 构造思考内容：如果有搜索结果，将其包含在思考中
    const thinkingContent = searchResult 
      ? `基于搜索结果：${searchResult}\n\n请深度思考：${query}`
      : query;

    for (let step = 1; step <= totalThoughts; step++) {
      try {
        console.debug(`[Multi-Command] Sequential Thinking Round ${step}/${totalThoughts}`);
        
        // 构造Sequential Thinking请求
        const mcpRequest: McpRequestMessage = {
          jsonrpc: "2.0" as const,
          id: Date.now() + step,
          method: "tools/call" as const,
          params: {
            name: "sequentialthinking",
            arguments: {
              thought: `${thinkingContent} (第${step}轮思考)`,
              nextThoughtNeeded: step < totalThoughts,
              thoughtNumber: step,
              totalThoughts: totalThoughts
            }
          }
        };

        const result = await executeMcpAction("sequential-thinking", mcpRequest);
        
        const resultText = typeof result === "object" 
          ? JSON.stringify(result, null, 2) 
          : String(result);
        
        const stepResult = `🤔 **思考 (${step}/${totalThoughts})**\n\n${resultText}`;
        results.push(stepResult);
        
        console.debug(`[Multi-Command] Sequential Thinking Round ${step} completed`);
        
        // 添加小延迟避免请求过快
        if (step < totalThoughts) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error: any) {
        console.error(`[Multi-Command] Sequential Thinking Round ${step} failed:`, error);
        const errorResult = `❌ **思考 (${step}/${totalThoughts}) 失败**\n\n错误: ${error?.message || String(error)}`;
        results.push(errorResult);
      }
    }
    
    return results;
  }

  /**
   * 执行多个命令的主函数
   */
  async executeCommandChain(userInput: string): Promise<MultiCommandResult> {
    const detection = this.detectMultipleCommands(userInput);
    
    if (!detection) {
      return {
        executed: false,
        commands: [],
        results: [],
        shouldContinueToLLM: false,
        combinedResult: "",
        originalIntent: userInput
      };
    }

    const { pattern, args } = detection;
    const results: McpCommandResult[] = [];
    const commands: CommandMapping[] = [];
    
    console.debug("[Multi-Command] Executing command chain:", pattern.commands);
    console.debug("[Multi-Command] Extracted args:", args);

    try {
      // 第一步：执行搜索
      if (pattern.commands[0] === 'tavily-search') {
        const searchCommand = detectCommand(`搜索 ${args[0]}`);
        if (searchCommand) {
          commands.push(searchCommand);
          const searchResult = await this.executeSingleCommand(searchCommand, `搜索 ${args[0]}`);
          results.push(searchResult);
        }
      }

      // 第二步：执行Sequential Thinking多轮调用
      if (pattern.commands[1] === 'sequential-thinking') {
        const thinkingCommand = detectCommand(`思考 ${args[1]}`);
        if (thinkingCommand) {
          commands.push(thinkingCommand);
          
          // 获取搜索结果用于思考
          const searchResultText = results.length > 0 ? results[0].result : undefined;
          
          // 执行多轮思考
          const thinkingResults = await this.executeSequentialThinking(args[1], searchResultText);
          
          // 将每轮思考结果包装成McpCommandResult
          for (let i = 0; i < thinkingResults.length; i++) {
            const thinkingResult: McpCommandResult = {
              executed: true,
              result: thinkingResults[i],
              shouldContinueToLLM: i === thinkingResults.length - 1, // 只有最后一轮继续到LLM
              originalIntent: args[1],
              command: thinkingCommand,
            };
            results.push(thinkingResult);
          }
        }
      }

      // 组合所有结果
      const combinedResult = results.map(r => r.result).filter(Boolean).join('\n\n---\n\n');
      
      // 构造增强提示词用于LLM分析
      const enhancedPrompt = `基于以下工具执行结果，请为用户提供综合性的分析和回答：

搜索结果：
${results[0]?.result || '无搜索结果'}

深度思考过程：
${results.slice(1).map((r, i) => `第${i+1}轮：${r.result}`).join('\n\n')}

用户的原始问题：${userInput}

请基于以上信息提供：
1. 对用户问题的直接回答
2. 基于搜索结果的事实性信息
3. 通过深度思考得出的洞察和分析
4. 相关的建议或后续行动`;

      return {
        executed: true,
        commands,
        results,
        shouldContinueToLLM: true,
        combinedResult,
        originalIntent: userInput,
        enhancedPrompt
      };

    } catch (error: any) {
      console.error("[Multi-Command] Command chain execution failed:", error);
      
      return {
        executed: true,
        commands,
        results,
        shouldContinueToLLM: false,
        combinedResult: `❌ **多工具执行失败**\n\n错误: ${error?.message || String(error)}`,
        originalIntent: userInput
      };
    }
  }
}

// 导出默认实例
export const multiCommandExecutor = new MultiCommandExecutor(); 