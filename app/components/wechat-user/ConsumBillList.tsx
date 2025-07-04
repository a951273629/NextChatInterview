import React, { useState, useEffect, useCallback } from "react";
import styles from "./ConsumBillList.module.scss";
import { safeLocalStorage } from "@/app/utils";
import { Path, WECHAT_USER_INFO_KEY } from "@/app/constant";
import { useNavigate } from "react-router-dom";
// 消费记录接口
interface ConsumptionRecord {
  id: number;
  amount: number;
  consume_type: string;
  created_at: string;
}

// 微信用户信息接口
interface WechatUserInfo {
  openid: string;
  nickname: string;
  avatar: string;
  accessToken: string;
  balance?: number;
}

// 组件属性接口
// interface ConsumBillListProps {
//   onClose: () => void;
// }

// 消费类型映射
const CONSUME_TYPE_MAP: Record<string, string> = {
  'time': '时间消费',
  'chat': '大模型问答',
  'mcp': '实时联网和深度思考',
  'azure-speech': 'Azure语音识别'
};

export function ConsumBillList() {
  const [records, setRecords] = useState<ConsumptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<WechatUserInfo | null>(null);
  const navigate = useNavigate();
  // 格式化时间
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  };

  // 获取消费类型显示名称
  const getConsumeTypeName = (type: string): string => {
    return CONSUME_TYPE_MAP[type] || type;
  };

  // 获取用户消费记录
  const fetchConsumptionRecords = useCallback(async () => {
    if (!userInfo?.openid) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/wechat-user/consumption?openid=${encodeURIComponent(userInfo.openid)}`
      );
      
      const data = await response.json();
      
      if (data.success) {
        // 限制最大50条记录
        const limitedRecords = (data.records || []).slice(0, 50);
        setRecords(limitedRecords);
      } else {
        setError(data.message || '获取消费记录失败');
      }
    } catch (err) {
      console.error('获取消费记录失败:', err);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [userInfo?.openid]);

  const onClose = () => {
    navigate(Path.Chat);
  }
  // 初始化用户信息
  useEffect(() => {
    const storage = safeLocalStorage();
    const userInfoStr = storage.getItem(WECHAT_USER_INFO_KEY);
    
    if (userInfoStr) {
      try {
        const parsedInfo = JSON.parse(userInfoStr) as WechatUserInfo;
        setUserInfo(parsedInfo);
      } catch (e) {
        console.error("解析用户信息失败", e);
        setError('用户信息无效，请重新登录');
      }
    } else {
      setError('请先登录');
    }
  }, []);

  // 当用户信息加载完成后获取消费记录
  useEffect(() => {
    if (userInfo?.openid) {
      fetchConsumptionRecords();
    }
  }, [userInfo?.openid, fetchConsumptionRecords]);

  // 点击背景关闭模态框
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modalContent}>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
        
        <div className={styles.billList}>
          <div className={styles.header}>
            <p className={styles.subtitle}>
              {userInfo?.nickname ? `${userInfo.nickname}的消费记录` : '您的消费记录'}
              {records.length > 0 && ` (显示最近${records.length}条)`}
            </p>
          </div>

          <div className={styles.content}>
            {loading && (
              <div className={styles.loading}>
                <div className={styles.loadingSpinner}></div>
                <p>正在加载消费记录...</p>
              </div>
            )}

            {error && (
              <div className={styles.error}>
                <div className={styles.errorIcon}>⚠️</div>
                <p>{error}</p>
                {userInfo?.openid && (
                  <button 
                    className={styles.retryButton} 
                    onClick={fetchConsumptionRecords}
                  >
                    重试
                  </button>
                )}
              </div>
            )}

            {!loading && !error && records.length === 0 && (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>📋</div>
                <p>暂无消费记录</p>
              </div>
            )}

            {!loading && !error && records.length > 0 && (
              <div className={styles.recordsList}>
                {records.map((record) => (
                  <div key={record.id} className={styles.recordItem}>
                    <div className={styles.recordLeft}>
                      <div className={styles.recordType}>
                        {getConsumeTypeName(record.consume_type)}
                      </div>
                      <div className={styles.recordTime}>
                        {formatDate(record.created_at)}
                      </div>
                    </div>
                    <div className={styles.recordRight}>
                      <div className={styles.recordAmount}>
                        -{record.amount}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
