import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../../constant";
import styles from "./WechatLogin.module.scss";
import LoadingIcon from "@/app/icons/loading.svg";
import SuccessIcon from "@/app/icons/confirm.svg";
import ErrorIcon from "@/app/icons/close.svg";
import Locale from "../../locales";
import { useAccessStore } from "../../store";
import { safeLocalStorage } from "../../utils";
// import { ErrorIcon, LoadingIcon, SuccessIcon } from "../ui-lib";

// 登录状态枚举
enum LoginStatus {
  IDLE = "idle",
  LOADING = "loading",
  READY = "ready",
  SCANNED = "scanned",
  CONFIRMED = "confirmed",
  SUCCESS = "success",
  ERROR = "error",
}

interface WechatLoginProps {
  onLoginSuccess?: (loginData: any) => void;
}

export function WechatLogin({ onLoginSuccess }: WechatLoginProps = {}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LoginStatus>(LoginStatus.LOADING);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [qrcodeUrl, setQrcodeUrl] = useState<string>("");
  const accessStore = useAccessStore();
  const storage = safeLocalStorage();
  const [currentScene, setCurrentScene] = useState<string>("");
  const [loginResult, setLoginResult] = useState<any>(null);

  // 页面加载时自动生成二维码
  useEffect(() => {
    generateQRCode();
  }, []);

  // 生成二维码
  const generateQRCode = async () => {
    setStatus(LoginStatus.LOADING);
    setErrorMessage("");
  //  login_${Date.now()}
    const scene = `12345678`;
    setCurrentScene(scene);

    try {
      const response = await fetch("/api/wechat/qrcode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scene: scene,
          page: "pages/login/login",
          env_version: "release"  // 使用正式版，体验版无法生成小程序码
        }),
      });

      const data = await response.json();
      if (data.success) {
        setQrcodeUrl(data.qrcode);
        setStatus(LoginStatus.READY);
        // 开始轮询登录状态
        startPollingLoginStatus(scene);
      } else {
        // 根据错误码提供更详细的提示
        let userMessage = data.message || "生成二维码失败";
        if (data.errcode === 41030) {
          userMessage = "小程序暂未发布或页面不存在，请联系开发者";
        } else if (data.errcode === 40001) {
          userMessage = "授权验证失败，请稍后重试";
        }
        setErrorMessage(userMessage);
        setStatus(LoginStatus.ERROR);
      }
    } catch (error) {
      setErrorMessage("网络错误，请稍后重试");
      setStatus(LoginStatus.ERROR);
    }
  };

  // 轮询登录状态
  const startPollingLoginStatus = (scene: string) => {
    const pollInterval = setInterval(async () => {
      try {
        console.log("轮询登录状态:", scene);
        
        const response = await fetch(`/api/wechat/check-login?scene=${encodeURIComponent(scene)}`);
        const data = await response.json();
        
        if (data.success && data.loggedIn) {
          // 登录成功
          console.log("用户已完成登录:", data.data);
          clearInterval(pollInterval);
          setStatus(LoginStatus.SUCCESS);
          setLoginResult(data.data);
          
          // 可选：通知父组件登录成功
          if (onLoginSuccess) {
            onLoginSuccess(data.data);
          }
          
          // 清理登录状态
          setTimeout(() => {
            fetch(`/api/wechat/check-login?scene=${encodeURIComponent(scene)}`, {
              method: 'DELETE'
            });
          }, 5000);
          
        } else if (!data.success) {
          // 检查出错
          console.error("检查登录状态失败:", data.message);
          clearInterval(pollInterval);
          setErrorMessage("检查登录状态失败");
          setStatus(LoginStatus.ERROR);
        }
        // 如果是 loggedIn: false，继续轮询
      } catch (error) {
        console.error("轮询登录状态出错:", error);
        // 网络错误不停止轮询，继续尝试
      }
    }, 3000); // 每3秒检查一次
    
    // 设置超时，避免无限轮询
    setTimeout(() => {
      clearInterval(pollInterval);
      if (status === LoginStatus.READY) {
        setErrorMessage("登录超时，请重新生成二维码");
        setStatus(LoginStatus.ERROR);
      }
    }, 300000); // 5分钟超时
  };

  // 刷新二维码
  const refreshQRCode = () => {
    generateQRCode();
  };

  // 处理登录错误
  const handleLoginError = () => {
    setStatus(LoginStatus.ERROR);
    setErrorMessage("登录失败，请稍后重试");
  };

  const renderStatus = () => {
    switch (status) {
      case LoginStatus.LOADING:
        return (
          <div className={styles["login-loading"]}>
            <div className={styles["loading-spinner"]}></div>
            <p>正在生成二维码...</p>
          </div>
        );
      case LoginStatus.READY:
        return (
          <div className={styles["login-qrcode"]}>
            <h3>请使用微信扫描二维码</h3>
            <div className={styles["qrcode-container"]}>
              <img src={qrcodeUrl} alt="登录二维码" className={styles["qrcode"]} />
            </div>
            <p className={styles["qrcode-tip"]}>扫码后自动完成登录</p>
          </div>
        );
      case LoginStatus.SUCCESS:
        return (
          <div className={styles["login-success"]}>
            <div className={styles["success-icon"]}>✅</div>
            <h3>登录成功！</h3>
            {loginResult?.userInfo && (
              <div className={styles["user-info"]}>
                <img 
                  src={loginResult.userInfo.avatarUrl} 
                  alt="头像" 
                  className={styles["user-avatar"]}
                />
                <p className={styles["user-name"]}>{loginResult.userInfo.nickName}</p>
              </div>
            )}
            <button onClick={generateQRCode} className={styles["reset-btn"]}>
              重新登录
            </button>
          </div>
        );
          //      case LoginStatus.ERROR:
          //  return (
          //    <div className={styles.statusWrapper}>
          //      <div className={styles.statusIcon}>
          //        <span className={styles.errorIcon}>❌</span>
          //      </div>
          //      <p className={styles.statusText}>{errorMessage}</p>
          //      <button className={styles.refreshButton} onClick={generateQRCode}>
          //        刷新二维码
          //      </button>
          //    </div>
          //  );
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <h2>{Locale.Auth.Title}</h2>
          <p className={styles.subtitle}>使用微信扫码登录</p>
        </div>

        <div className={styles.qrcodeContainer}>
          {renderStatus()}
        </div>

        {(status === LoginStatus.READY || status === LoginStatus.LOADING) && (
          <div className={styles.footer}>
            <p className={styles.expireHint}>二维码有效期为2分钟，请尽快扫码</p>
            <button
              className={styles.refreshButton}
              onClick={refreshQRCode}
              disabled={status === LoginStatus.LOADING}
            >
              刷新二维码
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
