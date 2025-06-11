import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import styles from "./ActivateKeyDialog.module.scss"; // 复用现有样式
import { ACTIVATION_KEY_STRING, ACTIVATION_KEY } from "./activation";
import { IconButton } from "../button";
import CloseIcon from "../../icons/close.svg";
import LoadingIcon from "../../icons/three-dots.svg";
import { safeLocalStorage } from "../../utils";
import { resumeKey } from "../../services/keyService";

const localStorage = safeLocalStorage();

interface ResumeKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ResumeKeyDialog: React.FC<ResumeKeyDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 用户点击ESC键关闭弹窗
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, onClose]);

  // 恢复密钥
  const handleResumeKey = async () => {
    const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
    if (!keyString) {
      setError("未找到暂停的密钥");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 调用服务层恢复密钥
      const updatedKey = await resumeKey(keyString);

      if (updatedKey && updatedKey.expires_at) {
        // 更新本地存储
        localStorage.setItem("user_activation_expiry", updatedKey.expires_at.toString());
        localStorage.setItem(ACTIVATION_KEY, "active");

        // 显示成功消息
        toast.success("密钥恢复成功！", {
          duration: 3000,
          style: {
            border: "1px solid #4CAF50",
            padding: "16px",
            color: "#333",
          },
        });

        // 关闭弹窗
        onClose();

        // 如果有成功回调，执行它
        if (onSuccess) {
          onSuccess();
        }
      } else {
        throw new Error("恢复成功但未返回过期时间");
      }
    } catch (err) {
      setError(`恢复密钥失败: ${(err as Error).message}`);
      toast.error(`恢复密钥失败: ${(err as Error).message}`, {
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-mask">
      <div className={styles["dialog-container"]}>
        <div className={styles["dialog-header"]}>
          <div className={styles["dialog-title"]}>恢复密钥</div>
          <div className="window-action-button" onClick={onClose}>
            <IconButton icon={<CloseIcon />} bordered title="关闭" />
          </div>
        </div>
        <div className={styles["dialog-content"]}>
          <p>您的密钥当前处于暂停状态。</p>
          <p>恢复密钥后，计时将从剩余时间继续开始。</p>
          {error && <div className={styles["error-message"]}>{error}</div>}
          <div className={styles["info-text"]}>
            点击[恢复]按钮以重新启用您的密钥。
          </div>
        </div>
        <div className={styles["dialog-footer"]}>
          <button
            className={`${styles["dialog-button"]} ${styles["cancel-button"]}`}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className={`${styles["dialog-button"]} ${styles["confirm-button"]}`}
            onClick={handleResumeKey}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <LoadingIcon />
                恢复中...
              </>
            ) : (
              "恢复"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResumeKeyDialog; 