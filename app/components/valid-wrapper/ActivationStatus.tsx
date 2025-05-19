import React, { useState, useEffect } from "react";
import {
  formatRemainingTime,
  ACTIVATION_KEY,
  getRemainingTime,
} from "./activation";
import KeyIcon from "../../icons/key.svg";
import { IconButton } from "../button";
import ActivateKeyDialog from "./ActivateKeyDialog";
import { safeLocalStorage } from "../../utils";

const KEY_COLOR = "#FFD700"; // 明亮的黄色
const localStorage = safeLocalStorage();

interface ActivationStatusProps {
  className?: string;
}

const ActivationStatus: React.FC<ActivationStatusProps> = ({ className }) => {
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [showDialog, setShowDialog] = useState<boolean>(false);

  // 每秒更新一次激活状态和剩余时间
  useEffect(() => {
    let isUpdating = false;

    const updateStatus = () => {
      // 防止并发更新
      if (isUpdating) return;
      try {
        isUpdating = true;
        // 获取激活状态直接从localStorage获取
        const status = localStorage.getItem(ACTIVATION_KEY);
        const active = status === "active";
        setIsActive(active);

        if (active) {
          // getRemainingTime
          const remaining = getRemainingTime();
          setRemainingTime(remaining);
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

  // 打开激活对话框
  const handleActivateClick = () => {
    setShowDialog(true);
  };

  // 激活成功后刷新状态
  const handleActivateSuccess = () => {
    // 直接从localStorage获取激活状态，避免调用isActivated可能引起的递归
    const status = localStorage.getItem("user_activation_status");
    setIsActive(status === "active");

    // getRemainingTime
    const remaining = getRemainingTime();
    setRemainingTime(remaining);
  };

  return (
    <>
      {isActive ? (
        // 已激活状态 - 显示剩余时间
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
        </div>
      ) : (
        // 未激活状态 - 显示激活按钮
        <IconButton
          icon={<KeyIcon />}
          onClick={handleActivateClick}
          className={className}
          style={{ color: KEY_COLOR }}
          title="激活应用"
        />
      )}

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
