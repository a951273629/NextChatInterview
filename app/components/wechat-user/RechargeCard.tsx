import React, { useState } from 'react';
import styles from './RechargeCard.module.scss';
import { safeLocalStorage } from '@/app/utils';
import { showConfirm } from '../ui-lib';
import { useNavigate } from 'react-router-dom';
import { Path, WECHAT_USER_INFO_KEY } from "@/app/constant";

// 充值结果接口
interface RechargeResult {
  success: boolean;
  message: string;
  balance?: number;
  amount?: number;
}

// 组件属性接口
interface RechargeCardProps {
  onClose: () => void;
}

export function RechargeCard() {
  const storage = safeLocalStorage();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RechargeResult | null>(null);

  // 处理充值
  const handleRecharge = async () => {
    if (!key.trim()) {
      setResult({
        success: false,
        message: '请输入充值卡密',
      });
      return;
    }
    const wechat_user_info = storage.getItem(WECHAT_USER_INFO_KEY);
    const openid = JSON.parse(wechat_user_info || '{}').openid;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/wechat-user/recharge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openid,
          key: key.trim(),
        }),
      });

      const rechargeResult = await response.json();
      setResult(rechargeResult);

      if (rechargeResult.success) {
        setKey(''); 
        showConfirm(rechargeResult.message);
        // onClose();
        navigate(Path.Chat);
      }
    } catch (error) {
      console.error('充值请求失败:', error);
      setResult({
        success: false,
        message: '网络错误，请稍后重试',
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理输入变化
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKey(e.target.value);
    // 清除之前的结果
    if (result) {
      setResult(null);
    }
  };

  // 处理回车提交
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleRecharge();
    }
  };

  // 点击背景关闭模态框
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      navigate(Path.Chat);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modalContent}>
        <button 
          className={styles.closeButton} 
          onClick={()=>{navigate(Path.Chat)}}
          aria-label="关闭"
        >
          ×
        </button>
        
        <div className={styles.rechargeCard}>
          <div className={styles.header}>
            <h3>充值卡密</h3>
            <p className={styles.subtitle}>请输入您的充值卡密</p>
          </div>

          <div className={styles.inputSection}>
            <div className={styles.inputGroup}>
              <label htmlFor="recharge-key" className={styles.label}>
                卡密
              </label>
              <input
                id="recharge-key"
                type="text"
                className={styles.input}
                placeholder="请输入充值卡密"
                value={key}
                onChange={handleKeyChange}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />
            </div>

            <button
              className={`${styles.submitBtn} ${loading ? styles.loading : ''}`}
              onClick={handleRecharge}
              disabled={loading || !key.trim()}
            >
              {loading ? '充值中...' : '立即充值'}
            </button>
          </div>

          {/* 结果显示 */}
          {result && (
            <div className={`${styles.result} ${result.success ? styles.success : styles.error}`}>
              <div className={styles.resultIcon}>
                {result.success ? '✅' : '❌'}
              </div>
              <div className={styles.resultText}>
                <p className={styles.message}>{result.message}</p>
                {result.success && result.amount && (
                  <p className={styles.detail}>
                    充值金额: {result.amount} 点
                  </p>
                )}
                {result.success && result.balance !== undefined && (
                  <p className={styles.balance}>
                    当前余额: {result.balance} 点
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 