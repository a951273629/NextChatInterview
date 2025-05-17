"use client";

import { useEffect, useState } from "react";
import styles from "./notice.module.scss";
import { Notice } from "../../api/notice/notice-service";

// 通知列表项类型
interface NoticeItem extends Notice {
  id: number;
}

export function NoticeSet() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // const navigate = useNavigate();

  // 获取所有通知
  const fetchNotices = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/notice");
      const result = await response.json();

      if (result.success) {
        setNotices(result.data);
      } else {
        setError(result.error || "获取通知列表失败");
      }
    } catch (err) {
      console.error("获取通知列表错误:", err);
      setError("获取通知列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取通知列表
  useEffect(() => {
    fetchNotices();
  }, []);

  // 处理选择现有通知进行编辑
  const handleSelectNotice = (notice: NoticeItem) => {
    setSelectedNotice(notice);
    setTitle(notice.title);
    setContent(notice.content);
    setIsActive(notice.is_active);
  };

  // 处理创建新通知
  const handleCreateNewNotice = () => {
    setSelectedNotice(null);
    setTitle("");
    setContent("");
    setIsActive(false);
  };

  // 处理保存通知
  const handleSaveNotice = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!title.trim() || !content.trim()) {
        setError("标题和内容不能为空");
        return;
      }

      let response;

      if (selectedNotice) {
        // 更新现有通知
        response = await fetch("/api/notice", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: selectedNotice.id,
            title,
            content,
            is_active: isActive,
          }),
        });
      } else {
        // 创建新通知
        response = await fetch("/api/notice", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            content,
            is_active: isActive,
          }),
        });
      }

      const result = await response.json();

      if (result.success) {
        setSuccess(selectedNotice ? "通知更新成功" : "通知创建成功");
        fetchNotices(); // 刷新通知列表

        // 如果是创建新通知，清空表单
        if (!selectedNotice) {
          setTitle("");
          setContent("");
          setIsActive(false);
        }
      } else {
        setError(
          result.error || (selectedNotice ? "更新通知失败" : "创建通知失败"),
        );
      }
    } catch (err) {
      console.error("保存通知错误:", err);
      setError("保存通知失败");
    } finally {
      setLoading(false);
    }
  };

  // 处理删除通知
  const handleDeleteNotice = async (id: number) => {
    if (!confirm("确定要删除这条通知吗？")) {
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/notice?id=${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        setSuccess("通知删除成功");
        fetchNotices(); // 刷新通知列表

        // 如果删除的是当前选中的通知，清空表单
        if (selectedNotice && selectedNotice.id === id) {
          setSelectedNotice(null);
          setTitle("");
          setContent("");
          setIsActive(false);
        }
      } else {
        setError(result.error || "删除通知失败");
      }
    } catch (err) {
      console.error("删除通知错误:", err);
      setError("删除通知失败");
    } finally {
      setLoading(false);
    }
  };

  // 处理切换通知状态
  const handleToggleStatus = async (id: number, isActive: boolean) => {
    try {
      setLoading(true);

      const response = await fetch("/api/notice", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          is_active: isActive,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(isActive ? "通知已激活" : "通知已停用");
        fetchNotices(); // 刷新通知列表

        // 如果是当前选中的通知，更新状态
        if (selectedNotice && selectedNotice.id === id) {
          setIsActive(isActive);
          setSelectedNotice({ ...selectedNotice, is_active: isActive });
        }
      } else {
        setError(result.error || "切换通知状态失败");
      }
    } catch (err) {
      console.error("切换通知状态错误:", err);
      setError("切换通知状态失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles["notice-set-container"]}>
      <h1>通知管理</h1>

      {/* 提示信息 */}
      {error && (
        <div style={{ color: "red", marginBottom: "10px" }}>{error}</div>
      )}
      {success && (
        <div style={{ color: "green", marginBottom: "10px" }}>{success}</div>
      )}

      {/* 通知列表 */}
      <div style={{ marginBottom: "20px" }}>
        <h2>通知列表</h2>
        {loading && <div>加载中...</div>}

        <div>
          <button
            onClick={handleCreateNewNotice}
            style={{ marginBottom: "10px" }}
          >
            创建新通知
          </button>
        </div>

        {notices.length === 0 ? (
          <div>暂无通知</div>
        ) : (
          <table className={styles["notice-table"]}>
            <thead>
              <tr>
                <th>标题</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((notice) => (
                <tr key={notice.id} onClick={() => handleSelectNotice(notice)}>
                  <td>{notice.title}</td>
                  <td>
                    {notice.is_active ? (
                      <span style={{ color: "green" }}>活跃</span>
                    ) : (
                      <span style={{ color: "gray" }}>停用</span>
                    )}
                  </td>
                  <td>
                    {new Date(notice.created_at! * 1000).toLocaleString()}
                  </td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(notice.id, !notice.is_active);
                      }}
                    >
                      {notice.is_active ? "停用" : "激活"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotice(notice.id);
                      }}
                      style={{ color: "red" }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 通知编辑表单 */}
      <div>
        <h2>{selectedNotice ? "编辑通知" : "创建通知"}</h2>
        <div className={styles["notice-form"]}>
          <div className={styles["form-group"]}>
            <label className={styles["form-label"]}>标题</label>
            <input
              type="text"
              className={styles["form-input"]}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入通知标题"
            />
          </div>

          <div className={styles["form-group"]}>
            <label className={styles["form-label"]}>内容</label>
            <textarea
              className={styles["form-textarea"]}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="请输入通知内容"
            />
          </div>

          <div className={styles["form-checkbox"]}>
            <input
              type="checkbox"
              id="is-active"
              className={styles["checkbox-input"]}
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="is-active" className={styles["checkbox-label"]}>
              激活此通知（将会停用其他通知）
            </label>
          </div>

          <div className={styles["button-group"]}>
            {/* <button
              className={styles["cancel-button"]}
              onClick={handleBack}
              disabled={loading}
            >
              返回
            </button> */}
            <button
              className={styles["save-button"]}
              onClick={handleSaveNotice}
              disabled={loading}
            >
              {loading ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NoticeSet;
