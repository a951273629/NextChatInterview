import React, { useState, useEffect } from "react";
import {
  formatRemainingTime,
  ACTIVATION_KEY,
  ACTIVATION_KEY_STRING,
  getRemainingTime,
} from "./activation";
import KeyIcon from "../../icons/key.svg";
import { IconButton } from "../button";
import ActivateKeyDialog from "./ActivateKeyDialog";
import { safeLocalStorage } from "../../utils";
import { pauseKey, resumeKey } from "../../services/keyService";

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
  const handlePauseKey = async () => {
    const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
    if (!keyString) {
      console.error("未找到激活的密钥");
      return;
    }

    if (window.confirm("确定要暂停此密钥吗？暂停后密钥将无法使用，但不会减少有效时长。")) {
      try {
        setIsLoading(true);

        await pauseKey(keyString);

        localStorage.setItem(ACTIVATION_KEY, "paused");
        // 更新状态
        setIsActive(false);
        setIsPaused(true);
        console.log("密钥暂停成功");
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
      return;
    }

    if (window.confirm("确定要恢复此密钥吗？恢复后密钥将继续计时。")) {
      try {
        setIsLoading(true);

        const updatedKey = await resumeKey(keyString);
        
        // 更新本地存储的过期时间
        if (updatedKey && updatedKey.expires_at) {
          localStorage.setItem("user_activation_expiry", updatedKey.expires_at.toString());
          localStorage.setItem(ACTIVATION_KEY, "active");
        }

        // 更新状态
        setIsActive(true);
        setIsPaused(false);
        console.log("密钥恢复成功");
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
          }}
        >
          <KeyIcon style={{ height: "16px", width: "16px" }} />
          <span>剩余: {formatRemainingTime(remainingTime)}</span>
          <button
            onClick={handlePauseKey}
            disabled={isLoading}
            style={{
              marginLeft: "8px",
              padding: "2px 6px",
              fontSize: "12px",
              backgroundColor: "#ff9800",
              color: "white",
              border: "none",
              borderRadius: "3px",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
            title="暂停密钥"
          >
            {isLoading ? "..." : "暂停"}
          </button>
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
          <button
            onClick={handleResumeKey}
            disabled={isLoading}
            style={{
              marginLeft: "8px",
              padding: "2px 6px",
              fontSize: "12px",
              backgroundColor: "#4caf50",
              color: "white",
              border: "none",
              borderRadius: "3px",
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
            title="恢复密钥"
          >
            {isLoading ? "..." : "恢复"}
          </button>
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
