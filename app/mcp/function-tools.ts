import { getAllTools } from "./actions";
import { MCPClientLogger } from "./logger";

const logger = new MCPClientLogger("MCP Function Tools");

/**
 * OpenAI Function Calling 工具格式
 */
export interface MCPFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

/**
 * MCP工具执行信息
 */
export interface MCPExecutionInfo {
  clientId: string;
  toolName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  request: any;
  status: 'starting' | 'success' | 'error';
  executionLog?: string;
}

/**
 * MCP工具调用结果
 */
export interface MCPToolCallResult {
  success: boolean;
  result?: any;
  error?: string;
  clientId: string;
  toolName: string;
  executionInfo?: MCPExecutionInfo;
}

/**
 * 将MCP工具转换为OpenAI Function Calling格式
 * 这是MCP-LLM集成的核心转换函数
 */
export async function convertMcpToolsToFunctionTools(): Promise<MCPFunctionTool[]> {
  try {
    logger.info("Converting MCP tools to OpenAI function calling format...");
    
    const allMcpTools = await getAllTools();
    const functionTools: MCPFunctionTool[] = [];
    
    for (const clientData of allMcpTools) {
      const { clientId, tools } = clientData;
      
      // 跳过没有工具或有错误的客户端
      if (!tools?.tools || !Array.isArray(tools.tools)) {
        logger.warn(`Skipping client [${clientId}]: no valid tools`);
        continue;
      }
      
      for (const tool of tools.tools) {
        try {
          // 构造OpenAI function calling格式
          const functionTool: MCPFunctionTool = {
            type: "function",
            function: {
              name: `${clientId}_${tool.name}`,  // 使用clientId前缀避免冲突
              description: tool.description || `MCP tool: ${tool.name}`,
              parameters: tool.inputSchema || {
                type: "object",
                properties: {},
                required: []
              }
            }
          };
          
          functionTools.push(functionTool);
          logger.debug(`Converted tool: ${functionTool.function.name}`);
          
        } catch (error) {
          logger.error(`Failed to convert tool ${tool.name} from client ${clientId}: ${error}`);
        }
      }
    }
    
    logger.success(`Successfully converted ${functionTools.length} MCP tools to function calling format`);
    return functionTools;
    
  } catch (error) {
    logger.error(`Failed to convert MCP tools: ${error}`);
    return [];
  }
}

/**
 * 解析LLM工具调用并执行对应的MCP工具
 * 这是处理LLM工具调用的核心函数
 */
export async function executeMcpToolFromLLMCall(
  toolCall: {
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }
): Promise<MCPToolCallResult> {
  const startTime = Date.now();
  let executionInfo: MCPExecutionInfo | undefined;
  
  try {
    logger.info(`Executing MCP tool call: ${toolCall.function.name}`);
    
    // 解析工具名称 (格式: clientId_toolName)
    const toolParts = toolCall.function.name.split('_');
    if (toolParts.length < 2) {
      throw new Error(`Invalid tool name format: ${toolCall.function.name}`);
    }
    
    const clientId = toolParts[0];
    const toolName = toolParts.slice(1).join('_');
    
    // 解析参数
    let args: any = {};
    try {
      args = JSON.parse(toolCall.function.arguments || '{}');
    } catch (parseError) {
      logger.error(`Failed to parse tool arguments: ${toolCall.function.arguments}`);
      throw new Error(`Invalid tool arguments: ${parseError}`);
    }
    
    // 构造MCP请求
    const mcpRequest = {
      jsonrpc: "2.0" as const,
      id: toolCall.id,
      method: "tools/call" as const,
      params: {
        name: toolName,
        arguments: args
      }
    };

    // 初始化执行信息
    executionInfo = {
      clientId,
      toolName,
      startTime,
      request: mcpRequest,
      status: 'starting',
      executionLog: `🔧 正在调用MCP工具: [${clientId}] ${toolName}\n📋 参数: ${JSON.stringify(args, null, 2)}`
    };
    
    // 动态导入避免循环依赖
    const { executeMcpAction } = await import("./actions");
    
    // 执行MCP工具
    const result = await executeMcpAction(clientId, mcpRequest);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 更新执行信息
    executionInfo.endTime = endTime;
    executionInfo.duration = duration;
    executionInfo.status = 'success';
    executionInfo.executionLog += `\n✅ 执行完成 (耗时: ${duration}ms)\n📤 结果: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`;
    
    logger.success(`MCP tool call completed: ${toolCall.function.name}`);
    
    return {
      success: true,
      result,
      clientId,
      toolName,
      executionInfo
    };
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // 如果executionInfo未初始化，创建一个基本的
    if (!executionInfo) {
      const toolParts = toolCall.function.name.split('_');
      const clientId = toolParts[0] || "unknown";
      const toolName = toolParts.slice(1).join('_') || toolCall.function.name;
      
      executionInfo = {
        clientId,
        toolName,
        startTime,
        request: { method: "tools/call", params: { name: toolName } },
        status: 'error',
        executionLog: `🔧 尝试调用MCP工具: [${clientId}] ${toolName}`
      };
    }
    
    // 更新错误信息
    executionInfo.endTime = endTime;
    executionInfo.duration = duration;
    executionInfo.status = 'error';
    executionInfo.executionLog += `\n❌ 执行失败 (耗时: ${duration}ms)\n🚨 错误: ${error instanceof Error ? error.message : String(error)}`;
    
    logger.error(`MCP tool call failed: ${toolCall.function.name} - ${error}`);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      clientId: executionInfo.clientId,
      toolName: executionInfo.toolName,
      executionInfo
    };
  }
}

/**
 * 检查MCP工具是否可用
 */
export async function areMcpToolsAvailable(): Promise<boolean> {
  try {
    const functionTools = await convertMcpToolsToFunctionTools();
    return functionTools.length > 0;
  } catch (error) {
    logger.error(`Failed to check MCP tools availability: ${error}`);
    return false;
  }
}

/**
 * 创建MCP工具的函数映射
 * 返回一个对象，键为工具名称，值为对应的执行函数
 * 这个函数映射将与Plugin系统的funcs合并使用
 */
export async function createMcpFunctionMapping(): Promise<Record<string, Function>> {
  try {
    logger.info("Creating MCP function mapping...");
    
    const mcpTools = await convertMcpToolsToFunctionTools();
    const funcMapping: Record<string, Function> = {};
    
    for (const tool of mcpTools) {
      const toolName = tool.function.name;
      
      // 为每个MCP工具创建执行函数
      funcMapping[toolName] = async (args: any) => {
        try {
          // 构造工具调用对象，模拟LLM的function calling格式
          const toolCall = {
            id: `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: "function",
            function: {
              name: toolName,
              arguments: JSON.stringify(args)
            }
          };
          
          // 执行MCP工具调用
          const result = await executeMcpToolFromLLMCall(toolCall);
          
          if (result.success) {
            // 返回符合现有Plugin系统期望的格式，并包含执行信息
            return {
              data: result.result,
              status: 200,
              statusText: "OK",
              mcpExecutionInfo: result.executionInfo
            };
          } else {
            // 返回错误格式，包含执行信息
            return {
              data: result.error || "MCP tool execution failed",
              status: 500,
              statusText: "Internal Server Error",
              mcpExecutionInfo: result.executionInfo
            };
          }
          
        } catch (error) {
          logger.error(`MCP function execution failed for ${toolName}: ${error}`);
          return {
            data: error instanceof Error ? error.message : String(error),
            status: 500,
            statusText: "Internal Server Error"
          };
        }
      };
    }
    
    logger.success(`Created ${Object.keys(funcMapping).length} MCP function mappings`);
    return funcMapping;
    
  } catch (error) {
    logger.error(`Failed to create MCP function mapping: ${error}`);
    return {};
  }
} 