// MCP Market 组件 - MCP服务器市场和管理界面
// 提供预设服务器浏览、添加、配置、启停等功能

import { IconButton } from "./button";
import { ErrorBoundary } from "./error";
import styles from "./mcp-market.module.scss";
import EditIcon from "../icons/edit.svg";
import AddIcon from "../icons/add.svg";
import CloseIcon from "../icons/close.svg";
import DeleteIcon from "../icons/delete.svg";
import RestartIcon from "../icons/reload.svg";
import EyeIcon from "../icons/eye.svg";
import GithubIcon from "../icons/github.svg";
import { List, ListItem, Modal, showToast } from "./ui-lib";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  addMcpServer,
  getClientsStatus,
  getClientTools,
  getMcpConfigFromFile,
  isMcpEnabled,
  pauseMcpServer,
  restartAllClients,
  resumeMcpServer,
} from "../mcp/actions";
import {
  ListToolsResponse,
  McpConfigData,
  PresetServer,
  ServerConfig,
  ServerStatusResponse,
} from "../mcp/types";
import clsx from "clsx";
import PlayIcon from "../icons/play.svg";
import StopIcon from "../icons/pause.svg";
import { Path } from "../constant";

// 配置属性接口定义 - 用于服务器配置表单
interface ConfigProperty {
  type: string;         // 属性类型（string, array等）
  description?: string; // 属性描述
  required?: boolean;   // 是否必填
  minItems?: number;    // 数组最小项数
}

/**
 * MCP Market 页面组件
 * 
 * 主要功能：
 * 1. 显示预设MCP服务器列表
 * 2. 管理服务器的添加、配置、启停
 * 3. 查看服务器状态和支持的工具
 * 4. 提供搜索和过滤功能
 */
export function McpMarketPage() {
  const navigate = useNavigate();

  // ==================== 状态管理 ====================
  
  // MCP功能启用状态
  const [mcpEnabled, setMcpEnabled] = useState(false);
  
  // 搜索文本状态
  const [searchText, setSearchText] = useState("");
  
  // 用户配置表单数据
  const [userConfig, setUserConfig] = useState<Record<string, any>>({});
  
  // 当前正在编辑的服务器ID
  const [editingServerId, setEditingServerId] = useState<string | undefined>();
  
  // 当前查看工具的服务器工具列表
  const [tools, setTools] = useState<ListToolsResponse["tools"] | null>(null);
  
  // 当前正在查看工具的服务器ID
  const [viewingServerId, setViewingServerId] = useState<string | undefined>();
  
  // 全局加载状态
  const [isLoading, setIsLoading] = useState(false);
  
  // MCP配置数据
  const [config, setConfig] = useState<McpConfigData>();
  
  // 各客户端状态信息
  const [clientStatuses, setClientStatuses] = useState<
    Record<string, ServerStatusResponse>
  >({});
  
  // 预设服务器列表加载状态
  const [loadingPresets, setLoadingPresets] = useState(true);
  
  // 预设服务器列表数据
  const [presetServers, setPresetServers] = useState<PresetServer[]>([]);
  
  // 各服务器操作的加载状态（如启动、停止等）
  const [loadingStates, setLoadingStates] = useState<Record<string, string>>(
    {},
  );

  // ==================== 副作用钩子 ====================

  /**
   * 检查MCP功能是否启用
   * 如果未启用则跳转到首页
   */
  useEffect(() => {
    const checkMcpStatus = async () => {
      const enabled = await isMcpEnabled();
      setMcpEnabled(enabled);
      if (!enabled) {
        navigate(Path.Home);
      }
    };
    checkMcpStatus();
  }, [navigate]);

  /**
   * 状态轮询 - 定期更新所有客户端状态
   * 每1000ms轮询一次，保持状态同步
   */
  useEffect(() => {
    if (!mcpEnabled || !config) return;

    const updateStatuses = async () => {
      const statuses = await getClientsStatus();
      setClientStatuses(statuses);
    };

    // 立即执行一次
    updateStatuses();
    // 每 1000ms 轮询一次
    const timer = setInterval(updateStatuses, 1000);

    return () => clearInterval(timer);
  }, [mcpEnabled, config]);

  /**
   * 加载预设服务器列表
   * 从远程API获取可用的MCP服务器预设配置
   */
  useEffect(() => {
    const loadPresetServers = async () => {
      if (!mcpEnabled) return;
      try {
        setLoadingPresets(true);
        const response = await fetch("https://nextchat.club/mcp/list");
        if (!response.ok) {
          throw new Error("Failed to load preset servers");
        }
        const data = await response.json();
        setPresetServers(data?.data ?? []);
      } catch (error) {
        console.error("Failed to load preset servers:", error);
        showToast("Failed to load preset servers");
      } finally {
        setLoadingPresets(false);
      }
    };
    loadPresetServers();
  }, [mcpEnabled]);

  /**
   * 加载初始状态
   * 获取当前MCP配置和所有客户端状态
   */
  useEffect(() => {
    const loadInitialState = async () => {
      if (!mcpEnabled) return;
      try {
        setIsLoading(true);
        const config = await getMcpConfigFromFile();
        setConfig(config);

        // 获取所有客户端的状态
        const statuses = await getClientsStatus();
        setClientStatuses(statuses);
      } catch (error) {
        console.error("Failed to load initial state:", error);
        showToast("Failed to load initial state");
      } finally {
        setIsLoading(false);
      }
    };
    loadInitialState();
  }, [mcpEnabled]);

  /**
   * 加载当前编辑服务器的配置
   * 当用户选择编辑某个服务器时，从现有配置中提取用户配置数据
   */
  useEffect(() => {
    if (!editingServerId || !config) return;
    const currentConfig = config.mcpServers[editingServerId];
    if (currentConfig) {
      // 从当前配置中提取用户配置
      const preset = presetServers.find((s) => s.id === editingServerId);
      if (preset?.configSchema) {
        const userConfig: Record<string, any> = {};
        Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
          if (mapping.type === "spread") {
            // 对于spread类型，从args中提取数组
            const startPos = mapping.position ?? 0;
            userConfig[key] = currentConfig.args.slice(startPos);
          } else if (mapping.type === "single") {
            // 对于single类型，获取单个值
            userConfig[key] = currentConfig.args[mapping.position ?? 0];
          } else if (
            mapping.type === "env" &&
            mapping.key &&
            currentConfig.env
          ) {
            // 对于env类型，从环境变量中获取值
            userConfig[key] = currentConfig.env[mapping.key];
          }
        });
        setUserConfig(userConfig);
      }
    } else {
      setUserConfig({});
    }
  }, [editingServerId, config, presetServers]);

  // 如果MCP未启用，不渲染组件
  if (!mcpEnabled) {
    return null;
  }

  // ==================== 工具函数 ====================

  /**
   * 检查服务器是否已添加到配置中
   * @param id 服务器ID
   * @returns 是否已添加
   */
  const isServerAdded = (id: string) => {
    return id in (config?.mcpServers ?? {});
  };

  /**
   * 保存服务器配置
   * 根据用户输入构建服务器配置并保存
   */
  const saveServerConfig = async () => {
    const preset = presetServers.find((s) => s.id === editingServerId);
    if (!preset || !preset.configSchema || !editingServerId) return;

    const savingServerId = editingServerId;
    setEditingServerId(undefined);

    try {
      updateLoadingState(savingServerId, "Updating configuration...");
      // 构建服务器配置
      const args = [...preset.baseArgs];
      const env: Record<string, string> = {};

      // 根据参数映射构建最终配置
      Object.entries(preset.argsMapping || {}).forEach(([key, mapping]) => {
        const value = userConfig[key];
        if (mapping.type === "spread" && Array.isArray(value)) {
          // spread类型：将数组展开到指定位置
          const pos = mapping.position ?? 0;
          args.splice(pos, 0, ...value);
        } else if (
          mapping.type === "single" &&
          mapping.position !== undefined
        ) {
          // single类型：单个值到指定位置
          args[mapping.position] = value;
        } else if (
          mapping.type === "env" &&
          mapping.key &&
          typeof value === "string"
        ) {
          // env类型：设置环境变量
          env[mapping.key] = value;
        }
      });

      const serverConfig: ServerConfig = {
        command: preset.command,
        args,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };

      const newConfig = await addMcpServer(savingServerId, serverConfig);
      setConfig(newConfig);
      showToast("Server configuration updated successfully");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to save configuration",
      );
    } finally {
      updateLoadingState(savingServerId, null);
    }
  };

  /**
   * 获取服务器支持的工具列表
   * @param id 服务器ID
   */
  const loadTools = async (id: string) => {
    try {
      const result = await getClientTools(id);
      if (result) {
        setTools(result);
      } else {
        throw new Error("Failed to load tools");
      }
    } catch (error) {
      showToast("Failed to load tools");
      console.error(error);
      setTools(null);
    }
  };

  /**
   * 更新加载状态的辅助函数
   * @param id 服务器ID
   * @param message 加载消息，null表示清除加载状态
   */
  const updateLoadingState = (id: string, message: string | null) => {
    setLoadingStates((prev) => {
      if (message === null) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: message };
    });
  };

  /**
   * 添加服务器
   * @param preset 预设服务器配置
   */
  const addServer = async (preset: PresetServer) => {
    if (!preset.configurable) {
      // 不需要配置的服务器，直接添加
      try {
        const serverId = preset.id;
        updateLoadingState(serverId, "Creating MCP client...");

        const serverConfig: ServerConfig = {
          command: preset.command,
          args: [...preset.baseArgs],
        };
        const newConfig = await addMcpServer(preset.id, serverConfig);
        setConfig(newConfig);

        // 更新状态
        const statuses = await getClientsStatus();
        setClientStatuses(statuses);
      } finally {
        updateLoadingState(preset.id, null);
      }
    } else {
      // 需要配置的服务器，打开配置对话框
      setEditingServerId(preset.id);
      setUserConfig({});
    }
  };

  /**
   * 暂停/停止服务器
   * @param id 服务器ID
   */
  const pauseServer = async (id: string) => {
    try {
      updateLoadingState(id, "Stopping server...");
      const newConfig = await pauseMcpServer(id);
      setConfig(newConfig);
      showToast("Server stopped successfully");
    } catch (error) {
      showToast("Failed to stop server");
      console.error(error);
    } finally {
      updateLoadingState(id, null);
    }
  };

  /**
   * 重启/启动服务器
   * @param id 服务器ID
   */
  const restartServer = async (id: string) => {
    try {
      updateLoadingState(id, "Starting server...");
      await resumeMcpServer(id);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Failed to start server, please check logs",
      );
      console.error(error);
    } finally {
      updateLoadingState(id, null);
    }
  };

  /**
   * 重启所有客户端
   */
  const handleRestartAll = async () => {
    try {
      updateLoadingState("all", "Restarting all servers...");
      const newConfig = await restartAllClients();
      setConfig(newConfig);
      showToast("Restarting all clients");
    } catch (error) {
      showToast("Failed to restart clients");
      console.error(error);
    } finally {
      updateLoadingState("all", null);
    }
  };

  // ==================== 渲染辅助函数 ====================

  /**
   * 渲染配置表单
   * 根据服务器的配置schema动态生成表单字段
   */
  const renderConfigForm = () => {
    const preset = presetServers.find((s) => s.id === editingServerId);
    if (!preset?.configSchema) return null;

    return Object.entries(preset.configSchema.properties).map(
      ([key, prop]: [string, ConfigProperty]) => {
        if (prop.type === "array") {
          // 数组类型字段 - 支持动态添加/删除项目
          const currentValue = userConfig[key as keyof typeof userConfig] || [];
          const itemLabel = (prop as any).itemLabel || key;
          const addButtonText =
            (prop as any).addButtonText || `Add ${itemLabel}`;

          return (
            <ListItem
              key={key}
              title={key}
              subTitle={prop.description}
              vertical
            >
              <div className={styles["path-list"]}>
                {(currentValue as string[]).map(
                  (value: string, index: number) => (
                    <div key={index} className={styles["path-item"]}>
                      <input
                        type="text"
                        value={value}
                        placeholder={`${itemLabel} ${index + 1}`}
                        onChange={(e) => {
                          const newValue = [...currentValue] as string[];
                          newValue[index] = e.target.value;
                          setUserConfig({ ...userConfig, [key]: newValue });
                        }}
                      />
                      <IconButton
                        icon={<DeleteIcon />}
                        className={styles["delete-button"]}
                        onClick={() => {
                          const newValue = [...currentValue] as string[];
                          newValue.splice(index, 1);
                          setUserConfig({ ...userConfig, [key]: newValue });
                        }}
                      />
                    </div>
                  ),
                )}
                <IconButton
                  icon={<AddIcon />}
                  text={addButtonText}
                  className={styles["add-button"]}
                  bordered
                  onClick={() => {
                    const newValue = [...currentValue, ""] as string[];
                    setUserConfig({ ...userConfig, [key]: newValue });
                  }}
                />
              </div>
            </ListItem>
          );
        } else if (prop.type === "string") {
          // 字符串类型字段
          const currentValue = userConfig[key as keyof typeof userConfig] || "";
          return (
            <ListItem key={key} title={key} subTitle={prop.description}>
              <input
                aria-label={key}
                type="text"
                value={currentValue}
                placeholder={`Enter ${key}`}
                onChange={(e) => {
                  setUserConfig({ ...userConfig, [key]: e.target.value });
                }}
              />
            </ListItem>
          );
        }
        return null;
      },
    );
  };

  /**
   * 检查服务器状态
   * @param clientId 客户端ID
   * @returns 服务器状态信息
   */
  const checkServerStatus = (clientId: string) => {
    return clientStatuses[clientId] || { status: "undefined", errorMsg: null };
  };

  /**
   * 获取服务器状态显示组件
   * @param clientId 客户端ID
   * @returns 状态显示组件
   */
  const getServerStatusDisplay = (clientId: string) => {
    const status = checkServerStatus(clientId);

    const statusMap = {
      undefined: null, // 未配置/未找到不显示
      // 初始化状态
      initializing: (
        <span className={clsx(styles["server-status"], styles["initializing"])}>
          Initializing
        </span>
      ),
      paused: (
        <span className={clsx(styles["server-status"], styles["stopped"])}>
          Stopped
        </span>
      ),
      active: <span className={styles["server-status"]}>Running</span>,
      error: (
        <span className={clsx(styles["server-status"], styles["error"])}>
          Error
          <span className={styles["error-message"]}>: {status.errorMsg}</span>
        </span>
      ),
    };

    return statusMap[status.status];
  };

  /**
   * 获取操作状态类型
   * @param message 状态消息
   * @returns 状态类型
   */
  const getOperationStatusType = (message: string) => {
    if (message.toLowerCase().includes("stopping")) return "stopping";
    if (message.toLowerCase().includes("starting")) return "starting";
    if (message.toLowerCase().includes("error")) return "error";
    return "default";
  };

  /**
   * 渲染服务器列表
   * 包括搜索过滤、状态排序、操作按钮等
   */
  const renderServerList = () => {
    // 加载中状态
    if (loadingPresets) {
      return (
        <div className={styles["loading-container"]}>
          <div className={styles["loading-text"]}>
            Loading preset server list...
          </div>
        </div>
      );
    }

    // 空列表状态
    if (!Array.isArray(presetServers) || presetServers.length === 0) {
      return (
        <div className={styles["empty-container"]}>
          <div className={styles["empty-text"]}>No servers available</div>
        </div>
      );
    }

    return presetServers
      .filter((server) => {
        // 搜索过滤
        if (searchText.length === 0) return true;
        const searchLower = searchText.toLowerCase();
        return (
          server.name.toLowerCase().includes(searchLower) ||
          server.description.toLowerCase().includes(searchLower) ||
          server.tags.some((tag) => tag.toLowerCase().includes(searchLower))
        );
      })
      .sort((a, b) => {
        // 状态排序 - 错误状态优先显示，然后是运行状态
        const aStatus = checkServerStatus(a.id).status;
        const bStatus = checkServerStatus(b.id).status;
        const aLoading = loadingStates[a.id];
        const bLoading = loadingStates[b.id];

        // 定义状态优先级
        const statusPriority: Record<string, number> = {
          error: 0,       // 错误状态最高优先级
          active: 1,      // 活跃状态第二
          initializing: 2, // 初始化中
          starting: 3,    // 启动中
          stopping: 4,    // 停止中
          paused: 5,      // 暂停状态
          undefined: 6,   // 未定义状态最低优先级
        };

        // 获取有效状态（包括加载状态）
        const getEffectiveStatus = (status: string, loading?: string) => {
          if (loading) {
            const operationType = getOperationStatusType(loading);
            return operationType === "default" ? status : operationType;
          }

          if (status === "initializing" && !loading) {
            return "active";
          }

          return status;
        };

        const aEffectiveStatus = getEffectiveStatus(aStatus, aLoading);
        const bEffectiveStatus = getEffectiveStatus(bStatus, bLoading);

        // 首先按状态排序
        if (aEffectiveStatus !== bEffectiveStatus) {
          return (
            (statusPriority[aEffectiveStatus] ?? 6) -
            (statusPriority[bEffectiveStatus] ?? 6)
          );
        }

        // 状态相同时按名称排序
        return a.name.localeCompare(b.name);
      })
      .map((server) => (
        <div
          className={clsx(styles["mcp-market-item"], {
            [styles["loading"]]: loadingStates[server.id],
          })}
          key={server.id}
        >
          <div className={styles["mcp-market-header"]}>
            <div className={styles["mcp-market-title"]}>
              <div className={styles["mcp-market-name"]}>
                {server.name}
                {/* 操作状态指示器 */}
                {loadingStates[server.id] && (
                  <span
                    className={styles["operation-status"]}
                    data-status={getOperationStatusType(
                      loadingStates[server.id],
                    )}
                  >
                    {loadingStates[server.id]}
                  </span>
                )}
                {/* 服务器状态显示 */}
                {!loadingStates[server.id] && getServerStatusDisplay(server.id)}
                {/* GitHub仓库链接 */}
                {server.repo && (
                  <a
                    href={server.repo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles["repo-link"]}
                    title="Open repository"
                  >
                    <GithubIcon />
                  </a>
                )}
              </div>
              {/* 标签显示 */}
              <div className={styles["tags-container"]}>
                {server.tags.map((tag, index) => (
                  <span key={index} className={styles["tag"]}>
                    {tag}
                  </span>
                ))}
              </div>
              {/* 服务器描述 */}
              <div
                className={clsx(styles["mcp-market-info"], "one-line")}
                title={server.description}
              >
                {server.description}
              </div>
            </div>
            {/* 操作按钮区域 */}
            <div className={styles["mcp-market-actions"]}>
              {isServerAdded(server.id) ? (
                <>
                  {/* 已添加服务器的操作按钮 */}
                  {server.configurable && (
                    <IconButton
                      icon={<EditIcon />}
                      text="Configure"
                      onClick={() => setEditingServerId(server.id)}
                      disabled={isLoading}
                    />
                  )}
                  {checkServerStatus(server.id).status === "paused" ? (
                    <>
                      {/* 暂停状态下的操作 */}
                      <IconButton
                        icon={<PlayIcon />}
                        text="Start"
                        onClick={() => restartServer(server.id)}
                        disabled={isLoading}
                      />
                    </>
                  ) : (
                    <>
                      {/* 运行状态下的操作 */}
                      <IconButton
                        icon={<EyeIcon />}
                        text="Tools"
                        onClick={async () => {
                          setViewingServerId(server.id);
                          await loadTools(server.id);
                        }}
                        disabled={
                          isLoading ||
                          checkServerStatus(server.id).status === "error"
                        }
                      />
                      <IconButton
                        icon={<StopIcon />}
                        text="Stop"
                        onClick={() => pauseServer(server.id)}
                        disabled={isLoading}
                      />
                    </>
                  )}
                </>
              ) : (
                /* 未添加服务器的添加按钮 */
                <IconButton
                  icon={<AddIcon />}
                  text="Add"
                  onClick={() => addServer(server)}
                  disabled={isLoading}
                />
              )}
            </div>
          </div>
        </div>
      ));
  };

  // ==================== 主渲染 ====================

  return (
    <ErrorBoundary>
      <div className={styles["mcp-market-page"]}>
        {/* 窗口头部 */}
        <div className="window-header">
          <div className="window-header-title">
            <div className="window-header-main-title">
              MCP Market
              {/* 全局操作加载指示器 */}
              {loadingStates["all"] && (
                <span className={styles["loading-indicator"]}>
                  {loadingStates["all"]}
                </span>
              )}
            </div>
            <div className="window-header-sub-title">
              {Object.keys(config?.mcpServers ?? {}).length} servers configured
            </div>
          </div>

          {/* 窗口操作按钮 */}
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<RestartIcon />}
                bordered
                onClick={handleRestartAll}
                text="Restart All"
                disabled={isLoading}
              />
            </div>
            <div className="window-action-button">
              <IconButton
                icon={<CloseIcon />}
                bordered
                onClick={() => navigate(-1)}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {/* 页面主体内容 */}
        <div className={styles["mcp-market-page-body"]}>
          {/* 搜索过滤区域 */}
          <div className={styles["mcp-market-filter"]}>
            <input
              type="text"
              className={styles["search-bar"]}
              placeholder={"Search MCP Server"}
              autoFocus
              onInput={(e) => setSearchText(e.currentTarget.value)}
            />
          </div>

          {/* 服务器列表 */}
          <div className={styles["server-list"]}>{renderServerList()}</div>
        </div>

        {/* 编辑服务器配置模态框 */}
        {editingServerId && (
          <div className="modal-mask">
            <Modal
              title={`Configure Server - ${editingServerId}`}
              onClose={() => !isLoading && setEditingServerId(undefined)}
              actions={[
                <IconButton
                  key="cancel"
                  text="Cancel"
                  onClick={() => setEditingServerId(undefined)}
                  bordered
                  disabled={isLoading}
                />,
                <IconButton
                  key="confirm"
                  text="Save"
                  type="primary"
                  onClick={saveServerConfig}
                  bordered
                  disabled={isLoading}
                />,
              ]}
            >
              <List>{renderConfigForm()}</List>
            </Modal>
          </div>
        )}

        {/* 查看服务器工具模态框 */}
        {viewingServerId && (
          <div className="modal-mask">
            <Modal
              title={`Server Details - ${viewingServerId}`}
              onClose={() => setViewingServerId(undefined)}
              actions={[
                <IconButton
                  key="close"
                  text="Close"
                  onClick={() => setViewingServerId(undefined)}
                  bordered
                />,
              ]}
            >
              <div className={styles["tools-list"]}>
                {isLoading ? (
                  <div>Loading...</div>
                ) : tools?.tools ? (
                  tools.tools.map(
                    (tool: ListToolsResponse["tools"], index: number) => (
                      <div key={index} className={styles["tool-item"]}>
                        <div className={styles["tool-name"]}>{tool.name}</div>
                        <div className={styles["tool-description"]}>
                          {tool.description}
                        </div>
                      </div>
                    ),
                  )
                ) : (
                  <div>No tools available</div>
                )}
              </div>
            </Modal>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
