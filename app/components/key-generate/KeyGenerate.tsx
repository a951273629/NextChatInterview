// app/KeyGenerate/page.tsx

"use client";

import { useState, useEffect } from "react";
import { KeyStatus, Key } from "../../constant";
import styles from "./KeyGenerate.module.scss";
import { 
  pauseKey, 
  resumeKey, 
  getAllKeys, 
  createKey, 
  deleteKey, 
  activateKey, 
  revokeKey, 
  getDeviceInfo 
} from "../../services/keyService";

// 分页配置
const PAGE_SIZE = 10;

export function KeyGeneratePage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [expiresHours, setExpiresHours] = useState<number>(2);
  const [selectedKey, setSelectedKey] = useState<Key | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [activationInfo, setActivationInfo] = useState({
    keyString: "",
    ipAddress: "",
    hardwareName: "",
  });
  // 新增状态
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
    visible: boolean;
  }>({ message: "", type: "success", visible: false });
  const [noteInput, setNoteInput] = useState<string>("");
  
  // 批量生成相关状态
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchCount, setBatchCount] = useState<number>(10);
  const [batchLoading, setBatchLoading] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    visible: boolean;
  }>({ current: 0, total: 0, visible: false });

  // 加载所有密钥
  const loadKeys = async () => {
    try {
      setLoading(true);
      setError(null);

      // 使用KeyService获取所有密钥
      const allKeys = await getAllKeys();
      setKeys(allKeys);
      setTotalPages(Math.ceil(allKeys.length / PAGE_SIZE));
    } catch (err) {
      setError(`获取密钥失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // 首次加载
  useEffect(() => {
    loadKeys();
    
    // 设置定时器，每分钟检查一次密钥状态，确保过期状态及时更新
    const intervalId = setInterval(() => {
      // 强制重新渲染以更新过期状态显示
      setKeys(prevKeys => [...prevKeys]);
    }, 120000); // 每2分钟检查一次
    
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // 显示通知
  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type, visible: true });
    setTimeout(() => {
      setNotification((prev) => ({ ...prev, visible: false }));
    }, 3000);
  };

  // 创建新密钥
  const handleCreateKey = async () => {
    try {
      setLoading(true);

      // 使用KeyService创建新密钥
      const newKey = await createKey(expiresHours, noteInput);
      setKeys((prevKeys) => [newKey, ...prevKeys]);
      setTotalPages(Math.ceil((keys.length + 1) / PAGE_SIZE));
      setNoteInput(""); // 清空备注输入
      showNotification("密钥创建成功！", "success");
    } catch (err) {
      setError(`创建密钥失败: ${(err as Error).message}`);
      showNotification(`创建密钥失败: ${(err as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // 批量创建密钥
  const handleBatchCreateKeys = async () => {
    if (batchCount <= 0 || batchCount > 1000) {
      showNotification("批量生成数量必须在1-1000之间", "error");
      return;
    }

    try {
      setBatchLoading(true);
      setBatchProgress({ current: 0, total: batchCount, visible: true });

      // 调用批量创建API
      const response = await fetch("/api/key-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          count: batchCount,
          expiresHours,
          notes: noteInput,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // 更新进度到100%
        setBatchProgress({ current: batchCount, total: batchCount, visible: true });
        
        // 添加新创建的密钥到列表前面
        setKeys((prevKeys) => [...data.keys, ...prevKeys]);
        setTotalPages(Math.ceil((keys.length + data.keys.length) / PAGE_SIZE));
        
        // 自动选中新生成的密钥
        const newKeyStrings = data.keys.map((key: Key) => key.key_string) as string[];
        const newSelectedKeys = new Set<string>(newKeyStrings);
        setSelectedKeys(newSelectedKeys);
        setIsAllSelected(false); // 因为只选中了新生成的密钥，不是全选状态
        
        // 清空表单
        setNoteInput("");
        setBatchCount(10);
        
        showNotification(`成功批量创建 ${data.count} 个密钥！即将自动导出...`, "success");
        
        // 自动触发导出
        setTimeout(() => {
          autoExportBatchKeys(data.keys);
        }, 1000); // 延迟1秒确保用户看到通知
      } else {
        throw new Error(data.error || "批量创建失败");
      }
    } catch (err) {
      setError(`批量创建密钥失败: ${(err as Error).message}`);
      showNotification(`批量创建密钥失败: ${(err as Error).message}`, "error");
    } finally {
      setBatchLoading(false);
      // 延迟隐藏进度条
      setTimeout(() => {
        setBatchProgress(prev => ({ ...prev, visible: false }));
      }, 2000);
    }
  };

  // 删除密钥
  const handleDeleteKey = async (keyString: string) => {
    if (window.confirm("确定要删除此密钥吗？")) {
      try {
        setLoading(true);

        // 使用KeyService删除密钥
        const result = await deleteKey(keyString);
        if (result.success) {
          const updatedKeys = keys.filter(
            (key) => key.key_string !== keyString,
          );
          setKeys(updatedKeys);
          setTotalPages(Math.ceil(updatedKeys.length / PAGE_SIZE));

          // 从选中集合中移除
          const newSelectedKeys = new Set(selectedKeys);
          newSelectedKeys.delete(keyString);
          setSelectedKeys(newSelectedKeys);

          showNotification("密钥删除成功！", "success");
        } else {
          setError("删除密钥失败");
          showNotification("删除密钥失败", "error");
        }
      } catch (err) {
        setError(`删除密钥失败: ${(err as Error).message}`);
        showNotification(`删除密钥失败: ${(err as Error).message}`, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // 批量删除选中的密钥
  const handleDeleteSelectedKeys = async () => {
    if (selectedKeys.size === 0) {
      showNotification("请至少选择一个密钥", "error");
      return;
    }

    if (window.confirm(`确定要删除选中的 ${selectedKeys.size} 个密钥吗？`)) {
      setLoading(true);
      let successCount = 0;
      let failCount = 0;

      // 串行删除所有选中的密钥
      for (const keyString of selectedKeys) {
        try {
          const result = await deleteKey(keyString);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      // 更新密钥列表
      await loadKeys();
      // 清空选中状态
      setSelectedKeys(new Set());
      setIsAllSelected(false);
      setLoading(false);

      if (failCount === 0) {
        showNotification(`成功删除 ${successCount} 个密钥`, "success");
      } else {
        showNotification(
          `删除了 ${successCount} 个密钥，${failCount} 个失败`,
          "error",
        );
      }
    }
  };

  // 激活密钥
  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { keyString, ipAddress, hardwareName } = activationInfo;

      // 使用KeyService激活密钥
      const updatedKey = await activateKey(keyString, ipAddress, hardwareName);

      if (updatedKey) {
        setKeys((prevKeys) =>
          prevKeys.map((key) =>
            key.key_string === keyString ? updatedKey : key,
          ),
        );
        setModalVisible(false);
        setActivationInfo({ keyString: "", ipAddress: "", hardwareName: "" });
        showNotification("密钥激活成功！", "success");
      }
    } catch (err) {
      setError(`激活密钥失败: ${(err as Error).message}`);
      showNotification(`激活密钥失败: ${(err as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // 撤销密钥
  const handleRevokeKey = async (keyString: string) => {
    if (window.confirm("确定要撤销此密钥吗？撤销后将无法使用。")) {
      try {
        setLoading(true);

        // 使用KeyService撤销密钥
        const updatedKey = await revokeKey(keyString);

        if (updatedKey) {
          setKeys((prevKeys) =>
            prevKeys.map((key) =>
              key.key_string === keyString ? updatedKey : key,
            ),
          );

          showNotification("密钥撤销成功！", "success");

          // 如果详情弹窗打开，更新信息
          if (modalVisible && selectedKey?.key_string === keyString) {
            setSelectedKey(updatedKey);
          }
        }
      } catch (err) {
        setError(`撤销密钥失败: ${(err as Error).message}`);
        showNotification(`撤销密钥失败: ${(err as Error).message}`, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // 暂停密钥
  const handlePauseKey = async (keyString: string) => {
    if (window.confirm("确定要暂停此密钥吗？暂停后密钥将无法使用，但不会减少有效时长。")) {
      try {
        setLoading(true);

        // 使用服务层暂停密钥
        const updatedKey = await pauseKey(keyString);

        if (updatedKey) {
          setKeys((prevKeys) =>
            prevKeys.map((key) =>
              key.key_string === keyString ? updatedKey : key,
            ),
          );

          showNotification("密钥暂停成功！", "success");

          // 如果详情弹窗打开，更新信息
          if (modalVisible && selectedKey?.key_string === keyString) {
            setSelectedKey(updatedKey);
          }
        }
      } catch (err) {
        setError(`暂停密钥失败: ${(err as Error).message}`);
        showNotification(`暂停密钥失败: ${(err as Error).message}`, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  // 恢复密钥
  const handleResumeKey = async (keyString: string) => {
    if (window.confirm("确定要恢复此密钥吗？恢复后密钥将继续计时。")) {
      try {
        setLoading(true);

        // 使用服务层恢复密钥
        const updatedKey = await resumeKey(keyString);

        if (updatedKey) {
          setKeys((prevKeys) =>
            prevKeys.map((key) =>
              key.key_string === keyString ? updatedKey : key,
            ),
          );

          showNotification("密钥恢复成功！", "success");

          // 如果详情弹窗打开，更新信息
          if (modalVisible && selectedKey?.key_string === keyString) {
            setSelectedKey(updatedKey);
          }
        }
      } catch (err) {
        setError(`恢复密钥失败: ${(err as Error).message}`);
        showNotification(`恢复密钥失败: ${(err as Error).message}`, "error");
      } finally {
        setLoading(false);
      }
    }
  };

  //  获取当前IP和设备信息
  const AcquireIpHardware = async () => {
    try {
      setLoading(true);

      // 使用KeyService获取设备信息
      const { ipAddress, hardwareName } = await getDeviceInfo();

      // 更新表单
      setActivationInfo({
        ...activationInfo,
        ipAddress,
        hardwareName,
      });

      showNotification("已自动填充IP和设备信息", "success");
    } catch (err) {
      showNotification("无法获取IP或设备信息，请手动填写", "error");
    } finally {
      setLoading(false);
    }
  };

  // 显示密钥详情
  const handleShowKeyDetails = (key: Key) => {
    setSelectedKey(key);
    setModalVisible(true);
    // 重置激活信息
    setActivationInfo({
      keyString: key.key_string,
      ipAddress: "",
      hardwareName: "",
    });
  };

  // 处理分页
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // 处理选择单个密钥
  const handleSelectKey = (keyString: string) => {
    const newSelectedKeys = new Set(selectedKeys);

    if (newSelectedKeys.has(keyString)) {
      newSelectedKeys.delete(keyString);
    } else {
      newSelectedKeys.add(keyString);
    }

    setSelectedKeys(newSelectedKeys);

    // 检查是否全选
    const currentPageKeys = getCurrentPageKeys();
    setIsAllSelected(
      currentPageKeys.length > 0 &&
        currentPageKeys.every((key) => newSelectedKeys.has(key.key_string)),
    );
  };

  // 处理全选/取消全选
  const handleSelectAll = () => {
    const currentPageKeys = getCurrentPageKeys();
    const newSelectedKeys = new Set(selectedKeys);

    if (isAllSelected) {
      // 取消当前页全选
      currentPageKeys.forEach((key) => {
        newSelectedKeys.delete(key.key_string);
      });
    } else {
      // 全选当前页
      currentPageKeys.forEach((key) => {
        newSelectedKeys.add(key.key_string);
      });
    }

    setSelectedKeys(newSelectedKeys);
    setIsAllSelected(!isAllSelected);
  };

  // 自动导出批量生成的密钥
  const autoExportBatchKeys = (keysToExport: Key[]) => {
    setExportLoading(true);

    try {
      let exportText = "批量生成密钥导出时间: " + new Date().toLocaleString() + "\n\n";

      keysToExport.forEach((key, index) => {
        exportText += `密钥 ${index + 1} `;
        exportText += `密钥: ${key.key_string} `;
        exportText += `有效时长: ${key.duration_hours || 2}小时`;
        if (key.notes) {
          exportText += ` 备注: ${key.notes}`;
        }
        exportText += "\n";
      });

      // 创建Blob和下载链接
      const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `批量生成密钥_${new Date().toISOString().slice(0, 10)}.txt`;

      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification(`成功导出 ${keysToExport.length} 个批量生成的密钥`, "success");
    } catch (err) {
      showNotification(`自动导出失败: ${(err as Error).message}`, "error");
    } finally {
      setExportLoading(false);
    }
  };

  // 导出选中的密钥为TXT
  const handleExportSelected = () => {
    if (selectedKeys.size === 0) {
      showNotification("请至少选择一个密钥", "error");
      return;
    }

    setExportLoading(true);

    try {
       let exportText= "导出时间: " + new Date().toLocaleString() + "\n\n";

      // 添加选中的密钥信息
      const selectedKeysList = keys.filter((key) =>
        selectedKeys.has(key.key_string),
      );

      selectedKeysList.forEach((key, index) => {
        exportText += `密钥 ${index + 1} `;
        exportText += `密钥: ${key.key_string} `;
        exportText += `有效时长: ${key.duration_hours || 2}小时`;

        // if (key.notes) {
        //   exportText += `备注: ${key.notes}\n`;
        // }

        // if (key.status === KeyStatus.ACTIVE) {
        //   exportText += `激活时间: ${formatTimestamp(key.activated_at)}\n`;
        //   exportText += `激活IP: ${key.activated_ip || "未记录"}\n`;
        //   exportText += `硬件名称: ${key.hardware_name || "未记录"}\n`;
        // }

        exportText += "\n";
      });

      // 创建Blob和下载链接
      const blob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `密钥导出_${new Date().toISOString().slice(0, 10)}.txt`;

      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showNotification(`成功导出 ${selectedKeys.size} 个密钥`, "success");
    } catch (err) {
      showNotification(`导出失败: ${(err as Error).message}`, "error");
    } finally {
      setExportLoading(false);
    }
  };

  // 生成分页按钮
  const renderPagination = () => {
    // 如果页数太多，只显示附近的几页
    const maxPagesShow = 5;
    const pages = [];

    // 添加上一页按钮
    pages.push(
      <button
        key="prev"
        className={styles.pageButton}
        onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        &laquo;
      </button>,
    );

    // 计算要显示的页码范围
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesShow - 1);

    // 调整以确保显示正确数量的页码
    if (endPage - startPage + 1 < maxPagesShow && startPage > 1) {
      startPage = Math.max(1, endPage - maxPagesShow + 1);
    }

    // 添加第一页
    if (startPage > 1) {
      pages.push(
        <button
          key={1}
          className={`${styles.pageButton} ${
            currentPage === 1 ? styles.activePage : ""
          }`}
          onClick={() => handlePageChange(1)}
        >
          1
        </button>,
      );

      // 添加省略号
      if (startPage > 2) {
        pages.push(
          <span key="ellipsis1" className={styles.ellipsis}>
            ...
          </span>,
        );
      }
    }

    // 添加页码按钮
    for (let i = startPage; i <= endPage; i++) {
      pages.push(
        <button
          key={i}
          className={`${styles.pageButton} ${
            currentPage === i ? styles.activePage : ""
          }`}
          onClick={() => handlePageChange(i)}
        >
          {i}
        </button>,
      );
    }

    // 添加最后一页
    if (endPage < totalPages) {
      // 添加省略号
      if (endPage < totalPages - 1) {
        pages.push(
          <span key="ellipsis2" className={styles.ellipsis}>
            ...
          </span>,
        );
      }

      pages.push(
        <button
          key={totalPages}
          className={`${styles.pageButton} ${
            currentPage === totalPages ? styles.activePage : ""
          }`}
          onClick={() => handlePageChange(totalPages)}
        >
          {totalPages}
        </button>,
      );
    }

    // 添加下一页按钮
    pages.push(
      <button
        key="next"
        className={styles.pageButton}
        onClick={() =>
          currentPage < totalPages && handlePageChange(currentPage + 1)
        }
        disabled={currentPage === totalPages}
      >
        &raquo;
      </button>,
    );

    return <div className={styles.pagination}>{pages}</div>;
  };

  // 获取当前页的密钥
  const getCurrentPageKeys = () => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    return keys.slice(startIndex, endIndex);
  };

  // 格式化时间戳为易读格式
  const formatTimestamp = (timestamp: number | null | undefined) => {
    if (!timestamp) return "未激活";
    return new Date(timestamp).toLocaleString();
  };

  // 检查密钥是否真正处于激活状态（未过期）
  const isKeyActuallyActive = (key: Key) => {
    if (key.status !== KeyStatus.ACTIVE) return false;
    if (!key.expires_at) return false;
    return key.expires_at >= Date.now();
  };

  // 获取密钥状态的中文描述
  const getStatusText = (status: KeyStatus, expiresAt?: number | null) => {
    // 首先检查是否已过期（仅对激活状态的密钥）
    if (status === KeyStatus.ACTIVE && expiresAt) {
      const currentTime = Date.now();
      if (expiresAt < currentTime) {
        return "已过期";
      }
    }
    
    switch (status) {
      case KeyStatus.INACTIVE:
        return "未激活";
      case KeyStatus.ACTIVE:
        return "激活中";
      case KeyStatus.EXPIRED:
        return "已过期";
      case KeyStatus.REVOKED:
        return "已撤销";
      case KeyStatus.PAUSED:
        return "已暂停";
      default:
        return "未知";
    }
  };

  // 根据状态获取状态的CSS类名
  const getStatusClass = (status: KeyStatus, expiresAt?: number | null) => {
    // 首先检查是否已过期（仅对激活状态的密钥）
    if (status === KeyStatus.ACTIVE && expiresAt) {
      const currentTime = Date.now();
      if (expiresAt < currentTime) {
        return styles.statusExpired;
      }
    }
    
    switch (status) {
      case KeyStatus.INACTIVE:
        return styles.statusInactive;
      case KeyStatus.ACTIVE:
        return styles.statusActive;
      case KeyStatus.EXPIRED:
        return styles.statusExpired;
      case KeyStatus.REVOKED:
        return styles.statusRevoked;
      case KeyStatus.PAUSED:
        return styles.statusPaused;
      default:
        return "";
    }
  };

  return (
    <div className={styles.container}>
      {/* 通知组件 */}
      {notification.visible && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      {/* 错误提示 */}
      {error && <div className={styles.error}>{error}</div>}

      {/* 创建密钥区域 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>创建新密钥</h2>
          <div className={styles.modeToggle}>
            <label className={styles.toggleContainer}>
              <input
                type="checkbox"
                checked={isBatchMode}
                onChange={(e) => setIsBatchMode(e.target.checked)}
              />
              <span className={styles.toggleSlider}></span>
              <span className={styles.toggleLabel}>批量模式</span>
            </label>
          </div>
        </div>
        <div className={styles.cardContent}>
          <div className={styles.formGroup}>
            <label htmlFor="expiresHours">有效期（小时）:</label>
            <input
              id="expiresHours"
              type="number"
              min="1"
              value={expiresHours}
              onChange={(e) => setExpiresHours(parseInt(e.target.value) || 24)}
              className={styles.input}
            />
          </div>
          
          {isBatchMode && (
            <div className={styles.formGroup}>
              <label htmlFor="batchCount">生成数量:</label>
              <input
                id="batchCount"
                type="number"
                min="1"
                max="1000"
                value={batchCount}
                onChange={(e) => setBatchCount(parseInt(e.target.value) || 10)}
                className={styles.input}
                placeholder="1-1000"
              />
              <small className={styles.formHint}>最多可批量生成1000个密钥</small>
            </div>
          )}
          
          <div className={styles.formGroup}>
            <label htmlFor="noteInput">备注信息:</label>
            <input
              id="noteInput"
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className={styles.input}
              placeholder="可选备注信息"
            />
          </div>

          {/* 批量生成进度条 */}
          {batchProgress.visible && (
            <div className={styles.progressContainer}>
              <div className={styles.progressLabel}>
                批量生成进度: {batchProgress.current} / {batchProgress.total}
              </div>
              <div className={styles.progressBar}>
                <div 
                  className={styles.progressFill}
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className={styles.buttonGroup}>
            {isBatchMode ? (
              <button
                className={styles.batchCreateButton}
                onClick={handleBatchCreateKeys}
                disabled={batchLoading || loading}
              >
                {batchLoading ? `生成中... (${batchProgress.current}/${batchProgress.total})` : `批量创建 ${batchCount} 个密钥`}
              </button>
            ) : (
              <button
                className={styles.createButton}
                onClick={handleCreateKey}
                disabled={loading || batchLoading}
              >
                {loading ? "处理中..." : "创建密钥"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 密钥列表 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>密钥列表</h2>
          <div className={styles.cardActions}>
            <button
              className={`${styles.actionButton} ${styles.exportButton}`}
              onClick={handleExportSelected}
              disabled={exportLoading || selectedKeys.size === 0}
            >
              {exportLoading ? "导出中..." : `导出选中 (${selectedKeys.size})`}
            </button>
            <button
              className={`${styles.actionButton} ${styles.deleteButton}`}
              onClick={handleDeleteSelectedKeys}
              disabled={loading || selectedKeys.size === 0}
            >
              删除选中 ({selectedKeys.size})
            </button>
          </div>
        </div>

        <div className={styles.cardContent}>
          {loading && !exportLoading && (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingSpinner}></div>
              <p>加载中...</p>
            </div>
          )}

          {!loading && keys.length === 0 && (
            <div className={styles.emptyState}>
              <p>没有找到任何密钥</p>
              <p className={styles.emptyStateHint}>
                点击[创建密钥]按钮生成新密钥
              </p>
            </div>
          )}

          {!loading && keys.length > 0 && (
            <>
              <div className={styles.tableContainer}>
                <table className={styles.keysTable}>
                  <thead>
                    <tr>
                      <th className={styles.checkboxCell}>
                        <label className={styles.checkboxContainer}>
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={handleSelectAll}
                          />
                          <span className={styles.checkmark}></span>
                        </label>
                      </th>
                      <th>密钥</th>
                      <th>状态</th>
                      <th>创建时间</th>
                      <th>过期时间</th>
                      <th>激活时间</th>
                      <th>卡密时长</th>
                      <th>激活IP</th>
                      <th>备注</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCurrentPageKeys().map((key) => (
                      <tr
                        key={key.key_string}
                        className={
                          selectedKeys.has(key.key_string)
                            ? styles.selectedRow
                            : ""
                        }
                      >
                        <td className={styles.checkboxCell}>
                          <label className={styles.checkboxContainer}>
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(key.key_string)}
                              onChange={() => handleSelectKey(key.key_string)}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                        </td>
                        <td className={styles.keyCell}>{key.key_string}</td>
                        <td>
                          <span className={getStatusClass(key.status, key.expires_at)}>
                            {getStatusText(key.status, key.expires_at)}
                          </span>
                        </td>
                        <td>{formatTimestamp(key.created_at)}</td>
                        <td>{formatTimestamp(key.expires_at)}</td>
                        <td>{formatTimestamp(key.activated_at) || "空"}</td>
                        <td>{key.duration_hours || "2"}小时</td>
                        <td>{key.activated_ip || "空"}</td>
                        <td className={styles.notesCell}>
                          {key.notes || "空"}
                        </td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              className={styles.viewButton}
                              onClick={() => handleShowKeyDetails(key)}
                            >
                              查看
                            </button>
                            {isKeyActuallyActive(key) && (
                              <>
                                <button
                                  className={styles.revokeButton}
                                  onClick={() => handleRevokeKey(key.key_string)}
                                  disabled={loading}
                                >
                                  撤销
                                </button>
                                <button
                                  className={styles.pauseButton}
                                  onClick={() => handlePauseKey(key.key_string)}
                                  disabled={loading}
                                >
                                  暂停
                                </button>
                              </>
                            )}
                            {key.status === KeyStatus.PAUSED && (
                              <button
                                className={styles.resumeButton}
                                onClick={() => handleResumeKey(key.key_string)}
                                disabled={loading}
                              >
                                恢复
                              </button>
                            )}
                            <button
                              className={styles.deleteButton}
                              onClick={() => handleDeleteKey(key.key_string)}
                              disabled={loading}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {renderPagination()}
            </>
          )}
        </div>
      </div>

      {/* 密钥详情/激活模态框 */}
      {modalVisible && selectedKey && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>密钥详情</h2>
              <button
                className={styles.closeButton}
                onClick={() => setModalVisible(false)}
              >
                &times;
              </button>
            </div>

            <div className={styles.modalContent}>
              <div className={styles.keyDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>密钥:</span>
                  <span className={styles.detailValue}>
                    {selectedKey.key_string}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>状态:</span>
                  <span
                    className={`${styles.detailValue} ${getStatusClass(
                      selectedKey.status,
                      selectedKey.expires_at,
                    )}`}
                  >
                    {getStatusText(selectedKey.status, selectedKey.expires_at)}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>创建时间:</span>
                  <span className={styles.detailValue}>
                    {formatTimestamp(selectedKey.created_at)}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>过期时间:</span>
                  <span className={styles.detailValue}>
                    {formatTimestamp(selectedKey.expires_at)}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>卡密时长:</span>
                  <span className={styles.detailValue}>
                    {selectedKey.duration_hours || "2"}小时
                  </span>
                </div>
                {selectedKey.notes && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>备注信息:</span>
                    <span className={styles.detailValue}>
                      {selectedKey.notes}
                    </span>
                  </div>
                )}

                {(selectedKey.status === KeyStatus.ACTIVE ||
                  selectedKey.status === KeyStatus.REVOKED) && (
                  <>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>激活时间:</span>
                      <span className={styles.detailValue}>
                        {formatTimestamp(selectedKey.activated_at)}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>激活IP:</span>
                      <span className={styles.detailValue}>
                        {selectedKey.activated_ip || "未记录"}
                      </span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>硬件名称:</span>
                      <span className={styles.detailValue}>
                        {selectedKey.hardware_name || "未记录"}
                      </span>
                    </div>
                  </>
                )}

                {isKeyActuallyActive(selectedKey) && (
                  <div className={styles.detailActions}>
                    <button
                      className={styles.revokeButton}
                      onClick={() => {
                        handleRevokeKey(selectedKey.key_string);
                      }}
                      disabled={loading}
                    >
                      撤销密钥
                    </button>
                  </div>
                )}
              </div>

              {selectedKey.status === KeyStatus.INACTIVE && (
                <div className={styles.activationForm}>
                  <h3>激活密钥</h3>
                  <form onSubmit={handleActivateKey}>
                    <input
                      type="hidden"
                      value={selectedKey.key_string}
                      onChange={(e) =>
                        setActivationInfo({
                          ...activationInfo,
                          keyString: e.target.value,
                        })
                      }
                    />

                    <div className={styles.formGroup}>
                      <label htmlFor="ipAddress">IP地址:</label>
                      <input
                        id="ipAddress"
                        type="text"
                        value={activationInfo.ipAddress}
                        onChange={(e) =>
                          setActivationInfo({
                            ...activationInfo,
                            ipAddress: e.target.value,
                            keyString: selectedKey.key_string,
                          })
                        }
                        className={styles.input}
                        required
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="hardwareName">硬件名称:</label>
                      <input
                        id="hardwareName"
                        type="text"
                        value={activationInfo.hardwareName}
                        onChange={(e) =>
                          setActivationInfo({
                            ...activationInfo,
                            hardwareName: e.target.value,
                            keyString: selectedKey.key_string,
                          })
                        }
                        className={styles.input}
                        required
                      />
                    </div>

                    <div className={styles.formActions}>
                      <button
                        type="button"
                        className={styles.testButton}
                        onClick={AcquireIpHardware}
                        disabled={loading}
                      >
                        获取Ip和设备
                      </button>
                      <button
                        type="submit"
                        className={styles.activateButton}
                        disabled={loading}
                      >
                        {loading ? "处理中..." : "激活密钥"}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
