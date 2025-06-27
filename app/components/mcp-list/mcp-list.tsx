// MCP 客户端列表组件 - 展示已激活的MCP客户端状态和工具信息
// 提供简洁的客户端概览界面，支持实时状态更新

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getClientsStatus,
  getAllTools,
  isMcpEnabled,
} from "../../mcp/actions";
import {
  ServerStatusResponse,
  ListToolsResponse,
} from "../../mcp/types";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import styles from "./mcp-list.module.scss";

// ==================== 接口定义 ====================

/**
 * MCP客户端信息接口
 * 包含客户端的基本信息、状态、工具等
 */
export interface McpClientInfo {
  clientId: string;                    // 客户端ID
  status: ServerStatusResponse;        // 状态信息
  tools: ListToolsResponse | null;     // 工具列表
  toolCount: number;                   // 工具数量
}

/**
 * 组件属性接口
 */
export interface McpListProps {
  className?: string;                  // 自定义样式类名
  showInactive?: boolean;              // 是否显示非活跃客户端
  autoRefresh?: boolean;               // 是否自动刷新（默认true）
  refreshInterval?: number;            // 刷新间隔（毫秒，默认2000）
}

// ==================== 主组件 ====================

/**
 * MCP客户端列表组件
 * 
 * 主要功能：
 * 1. 显示已激活的MCP客户端列表
 * 2. 实时更新客户端状态
 * 3. 显示每个客户端支持的工具数量
 * 4. 提供状态指示器和错误信息显示
 */
export function McpList({
  className,
  showInactive = false,
  autoRefresh = true,
  refreshInterval = 2000,
}: McpListProps) {
  
  // ==================== 状态管理 ====================
  const navigate = useNavigate();
  // MCP功能启用状态
  const [mcpEnabled, setMcpEnabled] = useState(false);
  
  // 客户端信息列表
  const [clients, setClients] = useState<McpClientInfo[]>([]);
  
  // 加载状态
  const [isLoading, setIsLoading] = useState(false);
  
  // 错误信息
  const [error, setError] = useState<string | null>(null);
  
  // 最后更新时间
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // ==================== 数据获取函数 ====================

  /**
   * 加载MCP客户端数据
   * 获取客户端状态和工具信息，合并成完整的客户端信息列表
   */
  const loadMcpClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 并行获取状态和工具信息
      const [clientStatuses, allTools] = await Promise.all([
        getClientsStatus(),
        getAllTools(),
      ]);

      // 构建客户端信息列表
      const clientInfos: McpClientInfo[] = [];

      // 遍历所有已配置的客户端
      for (const [clientId, status] of Object.entries(clientStatuses)) {
        // 查找对应的工具信息
        const toolInfo = allTools.find(t => t.clientId === clientId);
        
        const clientInfo: McpClientInfo = {
          clientId,
          status,
          tools: toolInfo?.tools || null,
          toolCount: toolInfo?.tools?.tools?.length || 0,
        };

        // 根据showInactive参数决定是否包含非活跃客户端
        if (showInactive || status.status === "active") {
          clientInfos.push(clientInfo);
        }
      }

      // 按状态优先级排序
      const sortedClients = clientInfos.sort((a, b) => {
        const statusPriority: Record<string, number> = {
          active: 0,      // 活跃状态最高优先级
          error: 1,       // 错误状态第二
          initializing: 2, // 初始化中
          paused: 3,      // 暂停状态
          undefined: 4,   // 未定义状态最低
        };

        const aPriority = statusPriority[a.status.status] ?? 4;
        const bPriority = statusPriority[b.status.status] ?? 4;

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // 状态相同时按客户端ID排序
        return a.clientId.localeCompare(b.clientId);
      });

      setClients(sortedClients);
      setLastUpdate(new Date());

    } catch (err) {
      console.error("Failed to load MCP clients:", err);
      setError(err instanceof Error ? err.message : "加载MCP客户端失败");
    } finally {
      setIsLoading(false);
    }
  }, [showInactive]);

  // ==================== 副作用钩子 ====================

  /**
   * 检查MCP功能是否启用
   */
  useEffect(() => {
    const checkMcpStatus = async () => {
      try {
        const enabled = await isMcpEnabled();
        setMcpEnabled(enabled);
        
        if (enabled) {
          // 首次加载数据
          await loadMcpClients();
        }
      } catch (error) {
        console.error("Failed to check MCP status:", error);
        setMcpEnabled(false);
      }
    };

    checkMcpStatus();
  }, []);

  /**
   * 自动刷新机制
   * 定期更新客户端状态
   */
  useEffect(() => {
    if (!mcpEnabled || !autoRefresh) return;

    const timer = setInterval(() => {
      loadMcpClients();
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [mcpEnabled, autoRefresh, refreshInterval]);

  // ==================== 渲染辅助函数 ====================

  /**
   * 获取状态显示组件
   * @param status 客户端状态
   * @returns 状态显示组件
   */
  const getStatusDisplay = (status: ServerStatusResponse) => {
    const statusConfig = {
      active: {
        className: "active",
        label: "活跃",
        color: "#10b981", // green
      },
      error: {
        className: "error", 
        label: "错误",
        color: "#ef4444", // red
      },
      initializing: {
        className: "initializing",
        label: "初始化中",
        color: "#f59e0b", // yellow
      },
      paused: {
        className: "paused",
        label: "已暂停",
        color: "#6b7280", // gray
      },
      undefined: {
        className: "undefined",
        label: "未知",
        color: "#9ca3af", // light gray
      },
    };

    const config = statusConfig[status.status as keyof typeof statusConfig] || statusConfig.undefined;

    return (
      <span 
        className={clsx(styles["status-badge"], styles[config.className])}
        style={{ backgroundColor: config.color }}
      >
        {config.label}
      </span>
    );
  };

  /**
   * 获取工具数量显示
   * @param toolCount 工具数量
   * @param status 客户端状态
   * @returns 工具数量显示组件
   */
  const getToolCountDisplay = (toolCount: number, status: ServerStatusResponse) => {
    if (status.status !== "active") {
      return <span className={styles["tool-count-disabled"]}>-</span>;
    }

    if (toolCount === 0) {
      return <span className={styles["tool-count-zero"]}>0 工具</span>;
    }

    return (
      <span className={styles["tool-count"]}>
        {toolCount} 个工具
      </span>
    );
  };

  // ==================== 主渲染 ====================

  // MCP未启用时不显示
  if (!mcpEnabled) {
    return (
      <div className={clsx(styles["mcp-list"], className)}>
        <div className={styles["mcp-disabled"]}>
          <span>🔒 MCP功能未启用</span>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(styles["mcp-list"], className)}>
      {/* 列表头部 */}
      <div className={styles["mcp-list-header"]}>
        {/* 导航回到聊天页面 */}
        <button className={styles["back-button"]} onClick={() => navigate("/chat")}>
          🔙 回到聊天
        </button>
        <h3 className={styles["title"]}>MCP 客户端</h3>
        <div className={styles["info"]}>
          <span className={styles["count"]}>
            {clients.length} 个客户端
          </span>
          {lastUpdate && (
            <span className={styles["last-update"]}>
              更新于 {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* 加载状态 */}
      {isLoading && clients.length === 0 && (
        <div className={styles["loading"]}>
          <span>🔄 正在加载...</span>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className={styles["error"]}>
          <span>❌ {error}</span>
        </div>
      )}

      {/* 客户端列表 */}
      {clients.length > 0 && (
        <div className={styles["client-list"]}>
          {clients.map((client) => (
            <div 
              key={client.clientId} 
              className={clsx(styles["client-item"], {
                [styles["active"]]: client.status.status === "active",
                [styles["error"]]: client.status.status === "error",
              })}
            >
              {/* 客户端基本信息 */}
              <div className={styles["client-info"]}>
                <div className={styles["client-name"]}>
                  <span className={styles["name"]}>{client.clientId}</span>
                  {getStatusDisplay(client.status)}
                </div>
                
                <div className={styles["client-details"]}>
                  {/* 工具数量 */}
                  <div className={styles["tool-info"]}>
                    {getToolCountDisplay(client.toolCount, client.status)}
                  </div>
                  
                  {/* 错误信息 */}
                  {client.status.errorMsg && (
                    <div className={styles["error-msg"]}>
                      ⚠️ {client.status.errorMsg}
                    </div>
                  )}
                </div>
              </div>

              {/* 工具列表（仅活跃客户端且有工具时显示） */}
              {client.status.status === "active" && 
               client.tools?.tools && 
               client.toolCount > 0 && (
                <div className={styles["tools-preview"]}>
                  <div className={styles["tools-header"]}>
                    <span>📋 可用工具：</span>
                  </div>
                                     <div className={styles["tools-list"]}>
                     {client.tools.tools.map((tool: any, index: number) => (
                       <span key={index} className={styles["tool-tag"]}>
                         {tool.name}
                       </span>
                     ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && !error && clients.length === 0 && (
        <div className={styles["empty-state"]}>
          <span>📭 暂无{showInactive ? "" : "活跃的"}MCP客户端</span>
          <small>请在MCP Market中添加和配置MCP服务器</small>
        </div>
      )}
    </div>
  );
}

// 导出默认组件
export default McpList; 