export interface CommandMapping {
  keywords: string[];        // 触发关键词
  clientId: string;         // MCP客户端ID  
  toolName: string;         // 工具名称
  description: string;      // 描述
  buildArgs?: (userInput: string) => object; // 参数构建函数
  
  // ==================== MCP-LLM闭环支持 ====================
  continueToLLM?: boolean;    // 是否将MCP结果继续传递给LLM（默认false保持向后兼容）
  resultTemplate?: string;    // 结果模板，用于格式化传递给LLM的内容
  // 所有MCP工具都使用 hybrid 模式：显示工具结果，同时传递给LLM进行进一步分析
}

// URL验证辅助函数
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// 从文本中提取URL
function extractUrlsFromText(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches ? matches.filter(isValidUrl) : [];
}

export const COMMAND_MAPPINGS: CommandMapping[] = [
  //Sequential Thinking工具
  {
    keywords: ["思考一下", "想想", "分析一下", "考虑", "思考", "分析", "想一想"],
    clientId: "sequential-thinking",
    toolName: "sequentialthinking", 
    description: "使用顺序思维分析问题",
    buildArgs: (input) => {
      // 移除触发关键词，获取实际需要思考的内容
      let cleanInput = input;
      const keywords = ["思考一下", "想想", "分析一下", "考虑", "思考", "分析", "想一想"];
      for (const keyword of keywords) {
        cleanInput = cleanInput.replace(new RegExp(keyword, 'gi'), '').trim();
      }
      
      return {
        thought: cleanInput || "需要仔细思考这个问题",
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 5
      };
    }
  },
  
  // Tavily Search - 搜索功能
  {
    keywords: ["搜索", "查找", "找一下", "search", "搜一下", "查询"],
    clientId: "tavily-mcp",
    toolName: "tavily-search",
    description: "使用Tavily进行网络搜索",
    // ==================== 配置MCP-LLM闭环 ====================
    continueToLLM: true,  // 启用闭环：搜索结果将传递给LLM进行智能分析
    resultTemplate: `基于以下网络搜索结果，请为用户提供准确、全面和有用的回答：

          搜索结果：
          {{mcpResult}}

          用户的原始问题：{{originalQuery}}

          请基于搜索结果提供：
          1. 直接回答用户的问题
          2. 引用具体的信息源（如果搜索结果中包含）`,
    buildArgs: (input) => {
      let cleanInput = input;
      const keywords = ["搜索", "查找", "找一下", "search", "搜一下", "查询"];
      for (const keyword of keywords) {
        cleanInput = cleanInput.replace(new RegExp(keyword, 'gi'), '').trim();
      }
      
      // 检测搜索深度
      const isAdvanced = /深度|详细|高级|advanced|detailed/i.test(input);
      
      // 检测时间范围
      let timeRange = "year";
      
      const query = cleanInput || "搜索信息";
      
      return {
        query: query,
        max_results: isAdvanced ? 20 : 10,
        search_depth: isAdvanced ? "advanced" : "basic",
        topic: "general",
        ...(timeRange && { time_range: timeRange }),
        include_images: false,
        include_raw_content: isAdvanced
      };
    }
  },
  
  // Tavily Extract - 内容提取功能
  {
    keywords: ["提取", "抓取", "extract", "获取内容", "解析网页", "爬取内容"],
    clientId: "tavily-mcp",
    toolName: "tavily-extract",
    description: "从指定URL提取网页内容",
    buildArgs: (input) => {
      let cleanInput = input;
      const keywords = ["提取", "抓取", "extract", "获取内容", "解析网页", "爬取内容"];
      for (const keyword of keywords) {
        cleanInput = cleanInput.replace(new RegExp(keyword, 'gi'), '').trim();
      }
      
      // 从输入中提取URL
      const urls = extractUrlsFromText(cleanInput);
      
      // 如果没有找到URL，返回错误提示
      if (urls.length === 0) {
        return {
          urls: [],
          error: "请提供有效的URL地址"
        };
      }
      
      // 检测是否需要高级提取
      const isAdvanced = /详细|高级|advanced|深度/i.test(input);
      
      return {
        urls: urls,
        extract_depth: isAdvanced ? "advanced" : "basic",
        format: "markdown",
        include_images: false
      };
    }
  },
  
  // Tavily Crawl - 网站爬取功能
  {
    keywords: ["爬取", "crawl", "爬虫", "抓取网站", "遍历网站", "爬取网站"],
    clientId: "tavily-mcp",
    toolName: "tavily-crawl",
    description: "系统性爬取整个网站内容",
    buildArgs: (input) => {
      let cleanInput = input;
      const keywords = ["爬取", "crawl", "爬虫", "抓取网站", "遍历网站", "爬取网站"];
      for (const keyword of keywords) {
        cleanInput = cleanInput.replace(new RegExp(keyword, 'gi'), '').trim();
      }
      
      // 从输入中提取URL
      const urls = extractUrlsFromText(cleanInput);
      
      // 如果没有找到URL，返回错误提示
      if (urls.length === 0) {
        return {
          url: "",
          error: "请提供要爬取的网站URL"
        };
      }
      
      // 检测深度设置
      let maxDepth = 1;
      const depthMatch = cleanInput.match(/深度\s*(\d+)|depth\s*(\d+)/i);
      if (depthMatch) {
        maxDepth = parseInt(depthMatch[1] || depthMatch[2]);
      }
      
      // 检测数量限制
      let limit = 50;
      const limitMatch = cleanInput.match(/限制\s*(\d+)|limit\s*(\d+)|最多\s*(\d+)/i);
      if (limitMatch) {
        limit = parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3]);
      }
      
      return {
        url: urls[0],
        max_depth: Math.min(maxDepth, 3), // 限制最大深度
        max_breadth: 20,
        limit: Math.min(limit, 100), // 限制最大数量
        extract_depth: "basic",
        format: "markdown",
        allow_external: false
      };
    }
  },
  
  // Tavily Map - 网站地图功能
  {
    keywords: ["网站地图", "地图", "map", "站点地图", "网站结构", "sitemap"],
    clientId: "tavily-mcp",
    toolName: "tavily-map",
    description: "生成网站结构地图",
    buildArgs: (input) => {
      let cleanInput = input;
      const keywords = ["网站地图", "地图", "map", "站点地图", "网站结构", "sitemap"];
      for (const keyword of keywords) {
        cleanInput = cleanInput.replace(new RegExp(keyword, 'gi'), '').trim();
      }
      
      // 从输入中提取URL
      const urls = extractUrlsFromText(cleanInput);
      
      // 如果没有找到URL，返回错误提示
      if (urls.length === 0) {
        return {
          url: "",
          error: "请提供要映射的网站URL"
        };
      }
      
      // 检测深度设置
      let maxDepth = 2;
      const depthMatch = cleanInput.match(/深度\s*(\d+)|depth\s*(\d+)/i);
      if (depthMatch) {
        maxDepth = parseInt(depthMatch[1] || depthMatch[2]);
      }
      
      return {
        url: urls[0],
        max_depth: Math.min(maxDepth, 3), // 限制最大深度
        max_breadth: 20,
        limit: 100,
        allow_external: false
      };
    }
  },
  
  // ==================== Sequential Thinking工具：深度思考分析 ====================
  {
    keywords: ["思考", "分析", "考虑", "think", "analyze"],
    clientId: "sequential-thinking",
    toolName: "sequentialthinking", 
    description: "深度思考分析工具",
    buildArgs: (userInput: string) => {
      const cleanInput = userInput.replace(/^(思考|分析|考虑|think|analyze)\s*/, "").trim();
      
      if (!cleanInput) {
        return { error: "请提供需要思考的问题或主题" };
      }
      
      return {
        thought: cleanInput || "需要仔细思考这个问题",
        nextThoughtNeeded: true,
        thoughtNumber: 1,
        totalThoughts: 5
      };
    },
    continueToLLM: true,
    resultTemplate: "基于以下深度思考结果：{{mcpResult}}\n\n原始问题：{{originalQuery}}\n\n请为用户提供基于深度思考的综合分析和建议："
  }
];

// 检测用户输入是否包含指令关键词
export function detectCommand(userInput: string): CommandMapping | null {
  const input = userInput.toLowerCase().trim();
  
  // 使用动态导入避免循环依赖
  let allMappings = COMMAND_MAPPINGS;
  
  // try {
  //   const { getAllCommandMappings, isDirectCommandEnabled } = require('./command-utils');
    
  //   if (!isDirectCommandEnabled()) {
  //     return null;
  //   }
    
  //   allMappings = getAllCommandMappings();
  // } catch (error) {
  //   console.debug("Using default command mappings:", error);
  // }
  
  for (const mapping of allMappings) {
    const matched = mapping.keywords.some(keyword => 
      input.includes(keyword.toLowerCase())
    );
    
    if (matched) {
      return mapping;
    }
  }
  
  return null;
} 