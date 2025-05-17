"use client";

import { useEffect, useState } from "react";
import styles from "./notice.module.scss";
import { Notice } from "../../api/notice/notice-service";

// 本地存储键名
const NOTICE_LAST_SHOWN_KEY = "notice_last_shown_time";
const NOTICE_ID_KEY = "notice_last_shown_id";
// 过期时间: 2小时（毫秒）
const EXPIRY_TIME = 2 * 60 * 60 * 1000; // 2小时的毫秒数

// 检查是否在浏览器环境中
const isBrowser = typeof window !== "undefined";

// 检查通知是否应该显示
const shouldShowNotice = (noticeId: number): boolean => {
  // 在服务器端渲染时总是返回false
  if (!isBrowser) return false;

  try {
    // 获取上次显示时间
    const lastShownTimeStr = localStorage.getItem(NOTICE_LAST_SHOWN_KEY);
    const lastShownId = localStorage.getItem(NOTICE_ID_KEY);

    if (!lastShownTimeStr || !lastShownId) {
      return true; // 没有记录过，应该显示
    }

    // 如果是新的通知ID，应该显示
    if (lastShownId !== noticeId.toString()) {
      return true;
    }

    const lastShownTime = parseInt(lastShownTimeStr, 10);
    const currentTime = Date.now();

    // 检查是否已过期（超过2小时）
    return currentTime - lastShownTime > EXPIRY_TIME;
  } catch (error) {
    console.error("检查通知显示时间出错:", error);
    return true; // 出错时默认显示
  }
};

// 记录通知已显示
const recordNoticeShown = (noticeId: number): void => {
  // 在服务器端渲染时不执行
  if (!isBrowser) return;

  try {
    localStorage.setItem(NOTICE_LAST_SHOWN_KEY, Date.now().toString());
    localStorage.setItem(NOTICE_ID_KEY, noticeId.toString());
  } catch (error) {
    console.error("记录通知显示时间出错:", error);
  }
};

interface NoticeAnnouncementProps {
  onClose: () => void;
}

export function NoticeAnnouncement(props: NoticeAnnouncementProps) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取活跃的通知
  useEffect(() => {
    const fetchActiveNotice = async () => {
      try {
        const response = await fetch("/api/notice?active=true");
        const result = await response.json();

        if (result.success && result.data) {
          setNotice(result.data);
        } else {
          // 没有活跃通知或发生错误
          props.onClose();
        }
      } catch (err) {
        console.error("获取通知失败:", err);
        setError("获取通知失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    };

    fetchActiveNotice();
  }, [props]);

  // 处理确认按钮点击
  const handleConfirm = () => {
    // 记录当前通知已显示
    if (notice?.id) {
      recordNoticeShown(notice.id);
    }
    props.onClose();
  };

  // 加载中显示
  if (loading) {
    return (
      <div className={styles["notice-overlay"]}>
        <div className={styles["notice-container"]}>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  // 错误显示
  if (error) {
    return (
      <div className={styles["notice-overlay"]}>
        <div className={styles["notice-container"]}>
          <div className={styles["notice-title"]}>错误</div>
          <div className={styles["notice-content"]}>{error}</div>
          <div className={styles["notice-footer"]}>
            <button
              className={styles["confirm-button"]}
              onClick={handleConfirm}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有通知，不显示
  if (!notice) {
    return null;
  }

  return (
    <div className={styles["notice-overlay"]}>
      <div className={styles["notice-container"]}>
        <div className={styles["notice-title"]}>{notice.title}</div>
        <div className={styles["notice-content"]}>{notice.content}</div>
        <div className={styles["notice-footer"]}>
          <button className={styles["confirm-button"]} onClick={handleConfirm}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

// 通知管理器组件，用于控制通知的显示
export function NoticeManager() {
  const [showNotice, setShowNotice] = useState(false);
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // 页面加载时检查是否有活跃通知
    const checkForActiveNotice = async () => {
      try {
        const response = await fetch("/api/notice?active=true");
        const result = await response.json();

        if (result.success && result.data) {
          const notice = result.data;

          // 检查是否应该显示通知
          if (notice.id && shouldShowNotice(notice.id)) {
            setActiveNotice(notice);
            setShowNotice(true);
          }
        }
      } catch (err) {
        console.error("检查通知失败:", err);
      }
    };

    checkForActiveNotice();
  }, []);

  const handleCloseNotice = () => {
    // 记录当前通知已显示
    if (activeNotice?.id) {
      recordNoticeShown(activeNotice.id);
    }
    setShowNotice(false);
  };

  if (!showNotice) {
    return null;
  }

  return <NoticeAnnouncement onClose={handleCloseNotice} />;
}

export default NoticeManager;
