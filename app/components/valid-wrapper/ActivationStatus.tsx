import React, { useState, useEffect } from "react";
import {
  formatRemainingTime,
  ACTIVATION_KEY,
  ACTIVATION_KEY_STRING,
  ACTIVATION_HARDWARE,
  ACTIVATION_IP,
  ACTIVATION_EXPIRY,
  LAST_SYNC_TIME,
  getRemainingTime,
} from "./activation";

import KeyIcon from "../../icons/key.svg";
import PauseIcon from "../../icons/pause.svg";
import PlayIcon from "../../icons/play.svg";
import { IconButton } from "../button";
import ActivateKeyDialog from "./ActivateKeyDialog";
import { safeLocalStorage } from "../../utils";
import { pauseKey, resumeKey, getKeyByString } from "../../services/keyService";

const KEY_COLOR = "#FFD700"; // 明亮的黄色
const localStorage = safeLocalStorage();

interface ActivationStatusProps {
  className?: string;
}

const ActivationStatus: React.FC<ActivationStatusProps> = ({ className }) => {
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showDialog, setShowDialog] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 从服务器获取密钥的真实状态
  const fetchKeyStatus = async (keyString: string) => {
    try {
      const response = await fetch(`/api/key-generate?key=${keyString}`);
      if (response.ok) {
        const key = await response.json();
        return key;
      }
    } catch (error) {
      console.error("获取密钥状态失败:", error);
    }
    return null;
  };

  // 每秒更新一次激活状态和剩余时间
  useEffect(() => {
    let isUpdating = false;

    const updateStatus = async () => {
      // 防止并发更新
      if (isUpdating) return;
      try {
        isUpdating = true;
        
        // 获取激活状态直接从localStorage获取
        const status = localStorage.getItem(ACTIVATION_KEY);
        const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
        
        if (status === "active" || status === "paused" && keyString) {
          // 从服务器获取真实状态
          const keyData = await fetchKeyStatus(keyString as string);
          
          if (keyData) {
            if (keyData.status === "paused") {
              // 密钥被暂停
              setIsActive(false);
              setIsPaused(true);
              setRemainingTime(0);
            } else if (keyData.status === "active") {
              // 密钥激活中
              setIsActive(true);
              setIsPaused(false);
              const remaining = getRemainingTime();
              setRemainingTime(remaining);
            } else {
              // 密钥已过期或被撤销等
              setIsActive(false);
              setIsPaused(false);
              setRemainingTime(0);
            }
          } else {
            // 无法获取密钥状态，使用本地状态
            setIsActive(true);
            setIsPaused(false);
            const remaining = getRemainingTime();
            setRemainingTime(remaining);
          }
        } else {
          // 未激活状态
          setIsActive(false);
          setIsPaused(false);
          setRemainingTime(0);
        }

        isUpdating = false;
      } catch (error) {
        console.error("更新激活状态失败:", error);
        isUpdating = false;
      }
    };

    // 立即更新一次
    updateStatus();

    // 设置定时器每秒更新
    const timer = setInterval(updateStatus, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  // 暂停密钥
  // 从服务器同步密钥状态
  const syncKeyStatusFromServer = async (keyString: string) => {
    try {
      const serverKey = await getKeyByString(keyString);
      if (!serverKey) {
        throw new Error("服务器上未找到该密钥");
      }
      return serverKey;
    } catch (error) {
      console.error("同步密钥状态失败:", error);
      throw new Error(`同步密钥状态失败: ${(error as Error).message}`);
    }
  };

  // 更新本地存储中的所有密钥相关信息
  const updateLocalStorage = (key: any) => {
    // 根据密钥状态设置激活状态
    let activationStatus = "inactive";
    if (key.status === "active") {
      activationStatus = "active";
    } else if (key.status === "paused") {
      activationStatus = "paused";
    } else if (key.status === "revoked") {
      activationStatus = "revoked";
    } else if (key.status === "expired") {
      activationStatus = "expired";
    }

    localStorage.setItem(ACTIVATION_KEY, activationStatus);
    localStorage.setItem(ACTIVATION_KEY_STRING, key.key_string);
    
    // 更新过期时间（如果存在）
    if (key.expires_at) {
      localStorage.setItem(ACTIVATION_EXPIRY, key.expires_at.toString());
    } else {
      localStorage.removeItem(ACTIVATION_EXPIRY);
    }
    
    // 更新IP和硬件信息（如果存在）
    if (key.activated_ip) {
      localStorage.setItem(ACTIVATION_IP, key.activated_ip);
    }
    if (key.hardware_name) {
      localStorage.setItem(ACTIVATION_HARDWARE, key.hardware_name);
    }
    
    // 更新最后同步时间
    localStorage.setItem(LAST_SYNC_TIME, Date.now().toString());
  };

  const handlePauseKey = async () => {
    const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
    if (!keyString) {
      console.error("未找到激活的密钥");
      alert("未找到激活的密钥");
      return;
    }

    if (window.confirm("确定要暂停此密钥吗？暂停后密钥将无法使用，但不会减少有效时长。")) {
      try {
        setIsLoading(true);

        // 1. 首先从服务器查询当前密钥状态
        console.log("正在从服务器查询密钥状态...");
        const serverKey = await syncKeyStatusFromServer(keyString);
        
        // 2. 验证密钥是否可以暂停
        if (serverKey.status !== "active") {
          throw new Error(`密钥当前状态为 ${serverKey.status}，只能暂停激活状态的密钥`);
        }

        // 3. 执行暂停操作
        console.log("密钥状态验证通过，正在执行暂停操作...");
        const updatedKey = await pauseKey(keyString);

        // 4. 验证暂停操作是否成功
        if (!updatedKey) {
          throw new Error("暂停操作未返回有效的密钥信息");
        }

        // 5. 更新本地存储
        updateLocalStorage(updatedKey);

        // 6. 更新组件状态
        setIsActive(false);
        setIsPaused(true);
        
        console.log("密钥暂停成功，本地状态已更新");
        // alert("密钥暂停成功！");
      } catch (error) {
        console.error("暂停密钥失败:", error);
        alert(`暂停密钥失败: ${(error as Error).message}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // 恢复密钥
  const handleResumeKey = async () => {
    const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
    if (!keyString) {
      console.error("未找到激活的密钥");
      alert("未找到激活的密钥");
      return;
    }

    if (window.confirm("确定要恢复此密钥吗？恢复后密钥将继续计时。")) {
      try {
        setIsLoading(true);

        // 1. 首先从服务器查询当前密钥状态
        console.log("正在从服务器查询密钥状态...");
        const serverKey = await syncKeyStatusFromServer(keyString);
        
        // 2. 验证密钥是否可以恢复
        if (serverKey.status !== "paused") {
          throw new Error(`密钥当前状态为 ${serverKey.status}，只能恢复暂停状态的密钥`);
        }

        // 3. 执行恢复操作
        console.log("密钥状态验证通过，正在执行恢复操作...");
        const updatedKey = await resumeKey(keyString);
        
        // 4. 验证恢复操作是否成功
        if (!updatedKey) {
          throw new Error("恢复操作未返回有效的密钥信息");
        }

        // 5. 更新本地存储
        updateLocalStorage(updatedKey);

        // 6. 更新组件状态
        setIsActive(true);
        setIsPaused(false);
        
        console.log("密钥恢复成功，本地状态已更新");
        // alert("密钥恢复成功！");
      } catch (error) {
        console.error("恢复密钥失败:", error);
        alert(`恢复密钥失败: ${(error as Error).message}`);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // 打开激活对话框
  const handleActivateClick = () => {
    setShowDialog(true);
  };

  // 激活成功后刷新状态
  const handleActivateSuccess = () => {
    // 直接从localStorage获取激活状态，避免调用isActivated可能引起的递归
    const status = localStorage.getItem("user_activation_status");
    setIsActive(status === "active");
    setIsPaused(false);

    // getRemainingTime
    const remaining = getRemainingTime();
    setRemainingTime(remaining);
  };

  // 渲染状态和按钮
  const renderContent = () => {
    if (isActive) {
      // 已激活状态 - 显示剩余时间和暂停按钮
      return (
        <div
          className={className}
          style={{
            color: KEY_COLOR,
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            position: "relative",
          }}
        >
          <KeyIcon style={{ height: "16px", width: "16px" }} />
          {/* 剩余时间悬浮样式 */}
          <span
            style={{
              position: "absolute",
              top: "0.3rem",
              right: "5rem",
              // left: "0",
              color: "rgba(252, 219, 32, 0.97)", // 半透明黄色字体
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "1rem",
              fontWeight: "normal",
              whiteSpace: "nowrap",
              zIndex: 1000,
            }}
          >
             {formatRemainingTime(remainingTime)}
          </span>
          <IconButton
            icon={<PauseIcon />}
            onClick={handlePauseKey}
            disabled={isLoading}
            title="暂停密钥"
            text={isLoading ? "..." : undefined}
            style={{
              marginLeft: "8px",
            }}
          />
        </div>
      );
    } else if (isPaused) {
      // 已暂停状态 - 显示暂停信息和恢复按钮
      return (
        <div
          className={className}
          style={{
            color: "#ff9800",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <KeyIcon style={{ height: "16px", width: "16px" }} />
          <span>已暂停</span>
          <IconButton
            icon={<PlayIcon />}
            onClick={handleResumeKey}
            disabled={isLoading}
            title="恢复密钥"
            text={isLoading ? "..." : undefined}
            style={{
              marginLeft: "8px",
            }}
          />
        </div>
      );
    } else {
      // 未激活状态 - 显示激活按钮
      return (
        <IconButton
          icon={<KeyIcon />}
          onClick={handleActivateClick}
          className={className}
          style={{ color: KEY_COLOR }}
          title="激活应用"
        />
      );
    }
  };

  return (
    <>
      {renderContent()}

      {/* 激活对话框 */}
      <ActivateKeyDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        onSuccess={handleActivateSuccess}
      />
    </>
  );
};

export default ActivationStatus;
