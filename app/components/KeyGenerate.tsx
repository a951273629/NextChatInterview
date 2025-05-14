// app/KeyGenerate/page.tsx

"use client";

import { useState, useEffect } from "react";
import { KeyStatus, Key } from "../constant";
import styles from "./KeyGenerate.module.scss";

// 分页配置
const PAGE_SIZE = 10;

export function KeyGeneratePage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [expiresHours, setExpiresHours] = useState<number>(24);
  const [selectedKey, setSelectedKey] = useState<Key | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [activationInfo, setActivationInfo] = useState({
    keyString: "",
    ipAddress: "",
    hardwareName: "",
  });

  // 加载所有密钥
  const loadKeys = async () => {
    try {
      setLoading(true);
      setError(null);

      // 使用API获取所有密钥
      const response = await fetch("/api/key-generate");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "获取密钥失败");
      }

      const allKeys = await response.json();
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
  }, []);

  // 创建新密钥
  const handleCreateKey = async () => {
    try {
      setLoading(true);

      // 使用API创建新密钥
      const response = await fetch("/api/key-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresHours }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "创建密钥失败");
      }

      const newKey = await response.json();
      setKeys((prevKeys) => [newKey, ...prevKeys]);
      setTotalPages(Math.ceil((keys.length + 1) / PAGE_SIZE));
    } catch (err) {
      setError(`创建密钥失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // 删除密钥
  const handleDeleteKey = async (keyString: string) => {
    if (window.confirm("确定要删除此密钥吗？")) {
      try {
        setLoading(true);

        // 使用API删除密钥
        const response = await fetch(`/api/key-generate?key=${keyString}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "删除密钥失败");
        }

        const result = await response.json();
        if (result.success) {
          const updatedKeys = keys.filter(
            (key) => key.key_string !== keyString,
          );
          setKeys(updatedKeys);
          setTotalPages(Math.ceil(updatedKeys.length / PAGE_SIZE));
        } else {
          setError("删除密钥失败");
        }
      } catch (err) {
        setError(`删除密钥失败: ${(err as Error).message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  // 激活密钥
  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { keyString, ipAddress, hardwareName } = activationInfo;

      // 使用API激活密钥
      const response = await fetch("/api/key-generate", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keyString, ipAddress, hardwareName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "激活密钥失败");
      }

      const updatedKey = await response.json();

      if (updatedKey) {
        setKeys((prevKeys) =>
          prevKeys.map((key) =>
            key.key_string === keyString ? updatedKey : key,
          ),
        );
        setModalVisible(false);
        setActivationInfo({ keyString: "", ipAddress: "", hardwareName: "" });
      }
    } catch (err) {
      setError(`激活密钥失败: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // 显示密钥详情
  const handleShowKeyDetails = (key: Key) => {
    setSelectedKey(key);
    setModalVisible(true);
  };

  // 处理分页
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // 生成分页按钮
  const renderPagination = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
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
    if (!timestamp) return "未设置";
    return new Date(timestamp).toLocaleString();
  };

  // 获取密钥状态的中文描述
  const getStatusText = (status: KeyStatus) => {
    switch (status) {
      case KeyStatus.INACTIVE:
        return "未激活";
      case KeyStatus.ACTIVE:
        return "激活中";
      case KeyStatus.EXPIRED:
        return "已过期";
      default:
        return "未知";
    }
  };

  // 根据状态获取状态的CSS类名
  const getStatusClass = (status: KeyStatus) => {
    switch (status) {
      case KeyStatus.INACTIVE:
        return styles.statusInactive;
      case KeyStatus.ACTIVE:
        return styles.statusActive;
      case KeyStatus.EXPIRED:
        return styles.statusExpired;
      default:
        return "";
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>密钥管理</h1>

      {/* 错误提示 */}
      {error && <div className={styles.error}>{error}</div>}

      {/* 创建密钥区域 */}
      <div className={styles.createSection}>
        <h2>创建新密钥</h2>
        <div className={styles.formGroup}>
          <label htmlFor="expiresHours">有效期（小时）:</label>
          <input
            id="expiresHours"
            type="number"
            min="1"
            value={expiresHours}
            onChange={(e) => setExpiresHours(parseInt(e.target.value) || 24)}
          />
        </div>
        <button
          className={styles.createButton}
          onClick={handleCreateKey}
          disabled={loading}
        >
          {loading ? "处理中..." : "创建密钥"}
        </button>
      </div>

      {/* 密钥列表 */}
      <div className={styles.keysSection}>
        <h2>密钥列表</h2>
        {loading && <p className={styles.loading}>加载中...</p>}

        {!loading && keys.length === 0 && (
          <p className={styles.noData}>没有找到任何密钥</p>
        )}

        {!loading && keys.length > 0 && (
          <>
            <div className={styles.tableContainer}>
              <table className={styles.keysTable}>
                <thead>
                  <tr>
                    <th>密钥</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>过期时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {getCurrentPageKeys().map((key) => (
                    <tr key={key.key_string}>
                      <td>{key.key_string}</td>
                      <td>
                        <span className={getStatusClass(key.status)}>
                          {getStatusText(key.status)}
                        </span>
                      </td>
                      <td>{formatTimestamp(key.created_at)}</td>
                      <td>{formatTimestamp(key.expires_at)}</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.viewButton}
                            onClick={() => handleShowKeyDetails(key)}
                          >
                            查看
                          </button>
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

      {/* 密钥详情/激活模态框 */}
      {modalVisible && selectedKey && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <span
              className={styles.closeButton}
              onClick={() => setModalVisible(false)}
            >
              &times;
            </span>
            <h2>密钥详情</h2>

            <div className={styles.keyDetails}>
              <p>
                <strong>密钥:</strong> {selectedKey.key_string}
              </p>
              <p>
                <strong>状态:</strong>{" "}
                <span className={getStatusClass(selectedKey.status)}>
                  {getStatusText(selectedKey.status)}
                </span>
              </p>
              <p>
                <strong>创建时间:</strong>{" "}
                {formatTimestamp(selectedKey.created_at)}
              </p>
              <p>
                <strong>过期时间:</strong>{" "}
                {formatTimestamp(selectedKey.expires_at)}
              </p>

              {selectedKey.status === KeyStatus.ACTIVE && (
                <>
                  <p>
                    <strong>激活时间:</strong>{" "}
                    {formatTimestamp(selectedKey.activated_at)}
                  </p>
                  <p>
                    <strong>激活IP:</strong>{" "}
                    {selectedKey.activated_ip || "未记录"}
                  </p>
                  <p>
                    <strong>硬件名称:</strong>{" "}
                    {selectedKey.hardware_name || "未记录"}
                  </p>
                </>
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
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className={styles.activateButton}
                    disabled={loading}
                  >
                    {loading ? "处理中..." : "激活密钥"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
