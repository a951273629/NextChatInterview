import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./PersonalCenter.module.scss";
import { Path, WECHAT_USER_INFO_KEY } from "../../constant";
import { useAccessStore } from "../../store";
import { safeLocalStorage } from "../../utils";
import { showConfirm } from "../ui-lib";

interface WechatUserInfo {
  openid: string;
  nickname: string;
  avatar: string;
  accessToken: string;
  balance?: number;
}

export function PersonalCenter(props: { onClose: () => void }) {
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const storage = safeLocalStorage();
  const [userInfo, setUserInfo] = useState<WechatUserInfo | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // 获取用户余额
  const fetchUserBalance = useCallback(async () => {
    if (!userInfo?.openid) return;
    
    setBalanceLoading(true);
    try {
      const response = await fetch(`/api/wechat-user/user?openid=${userInfo.openid}`);
      const data = await response.json();
      
      if (data.success && data.user) {
        const newBalance = data.user.balance || 0;
        setBalance(newBalance);
        
        // 更新localStorage中的用户信息
        const updatedUserInfo = { ...userInfo, balance: newBalance };
        setUserInfo(updatedUserInfo);
        safeLocalStorage().setItem(WECHAT_USER_INFO_KEY, JSON.stringify(updatedUserInfo));
      } else {
        console.error("获取用户信息失败:", data.message);
      }
    } catch (error) {
      console.error("获取余额失败:", error);
    } finally {
      setBalanceLoading(false);
    }
  }, [userInfo]);
  
  // 加载用户信息
  useEffect(() => {
    const userInfoStr = storage.getItem(WECHAT_USER_INFO_KEY);
    if (userInfoStr) {
      try {
        const parsedInfo = JSON.parse(userInfoStr);
        setUserInfo(parsedInfo);
        // 如果localStorage中有余额信息，先显示缓存的余额
        // if (parsedInfo.balance !== undefined) {
        //   setBalance(parsedInfo.balance);
        // }
      } catch (e) {
        console.error("Failed to parse user info", e);
      }
    }
  }, []);


  // 当 userInfo 加载完成后，获取最新余额
  useEffect(() => {
    if (userInfo?.openid) {
      fetchUserBalance();
    }
  }, [userInfo?.openid, fetchUserBalance]);

  // 处理登出
  const handleLogout = async () => {
    const confirmed = await showConfirm("确定要退出登录吗？");
    if (confirmed) {
      // 清除登录信息
      storage.removeItem(WECHAT_USER_INFO_KEY);

      // 更新访问状态
      accessStore.update((access) => {
        access.accessToken = "";
        access.wechatLoggedIn = false;
      });

      // 跳转到登录页
      navigate(Path.Home);
    }
    // props.onClose();
  };

  // 点击背景关闭模态框
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  // 如果没有用户信息，显示登录按钮
  if (!accessStore.wechatLoggedIn) {
    return (
      <div className={styles.modalOverlay} onClick={handleOverlayClick}>
        <div className={styles.modalContent} ref={menuRef}>
          <div
            className={styles.loginPrompt}
            onClick={() => {
              navigate(Path.Login);
              props.onClose();
            }}
          >
            点击登录
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modalContent} ref={menuRef}>
        <div className={styles.avatarContainer}>
          <img
            src={userInfo?.avatar}
            alt={userInfo?.nickname}
            className={styles.avatar}
          />
          <div className={styles.userInfo}>
            <div className={styles.nickname}>{userInfo?.nickname}</div>
            <div className={styles.balanceInfo}>
              <span>余额: {balance} </span>
            </div>
            <div className={styles.userId}>ID: {userInfo?.openid}</div>
          </div>
        </div>

        <div className={styles.menu}>
          <div
            className={styles.menuItem}
            onClick={() => {
              navigate(Path.Resume);
              props.onClose();
            }}
          >
            上传个人简历
          </div>
          <div
            className={styles.menuItem}
            onClick={() => {
              navigate(Path.Recharge);
              props.onClose();
            }}
          >
            充值
          </div>

          <div
            className={styles.menuItem}
            onClick={() => {
              navigate(Path.ConsumBillList);
              props.onClose();
            }}
          >
            使用额度记录
          </div>
          <div className={styles.menuItem} onClick={handleLogout}>
            退出登录
          </div>
        </div>
      </div>
    </div>
  );
}
