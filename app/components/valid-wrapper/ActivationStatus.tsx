import React, { useState, useEffect } from "react";
import {
  isActivated,
  getRemainingTime,
  formatRemainingTime,
} from "./activation";
import KeyIcon from "../../icons/key.svg";
import { IconButton } from "../button";
import ActivateKeyDialog from "./ActivateKeyDialog";

const KEY_COLOR = "#FFD700"; // 明亮的黄色

interface ActivationStatusProps {
  className?: string;
}

const ActivationStatus: React.FC<ActivationStatusProps> = ({ className }) => {
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [showDialog, setShowDialog] = useState<boolean>(false);

  // 每秒更新一次激活状态和剩余时间
  useEffect(() => {
    const updateStatus = () => {
      const active = isActivated();
      setIsActive(active);

      if (active) {
        setRemainingTime(getRemainingTime());
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
    setIsActive(isActivated());
    setRemainingTime(getRemainingTime());
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
