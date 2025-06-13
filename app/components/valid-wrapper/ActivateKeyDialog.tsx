import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import styles from "./ActivateKeyDialog.module.scss";
import { setActivated } from "./activation";
import {
  activateKey,
  getDeviceInfo,
  getKeyByString,
  resumeKey,
} from "../../services/keyService";
import { KeyStatus } from "@/app/constant";
import { IconButton } from "../button";
import CloseIcon from "../../icons/close.svg";
import LoadingIcon from "../../icons/three-dots.svg";

interface ActivateKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ActivateKeyDialog: React.FC<ActivateKeyDialogProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [keyString, setKeyString] = useState("");
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

  // 激活密钥
  const handleActivateKey = async () => {
    if (!keyString.trim()) {
      setError("请输入激活密钥");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 获取设备信息
      const { ipAddress, hardwareName } = await getDeviceInfo();

      // 首先查询密钥状态
      const keyInfo = await getKeyByString(keyString.trim());

      if (!keyInfo) {
        throw new Error("密钥不存在");
      }

      let updatedKey;
      let operationType = "激活";

      if (keyInfo.status === KeyStatus.EXPIRED) {
        throw new Error("密钥已过期");
      }

      if (keyInfo.status === KeyStatus.REVOKED) {
        throw new Error("密钥已被撤销");
      }

      if (
        keyInfo.status === KeyStatus.INACTIVE ||
        keyInfo.status === KeyStatus.ACTIVE
      ) {
        updatedKey = await activateKey(
          keyString.trim(),
          ipAddress,
          hardwareName,
        );
      } else if (keyInfo.status === KeyStatus.PAUSED) {
        updatedKey = await resumeKey(keyString.trim()); // 如果是暂停状态，检查剩余时间是否有效

        if (
          keyInfo.remaining_time_on_pause &&
          keyInfo.remaining_time_on_pause > 0
        ) {
          // 执行恢复操作
          updatedKey = await resumeKey(keyString.trim());
          operationType = "恢复";
        } else {
          throw new Error("暂停的密钥剩余时间已耗尽，无法恢复");
        }
        
      } else if (keyInfo.status === KeyStatus.ACTIVE) {
        updatedKey = keyInfo;
      }

      if (updatedKey) {
        // 设置本地激活状态
        if (updatedKey.expires_at) {
          setActivated(
            updatedKey.key_string,
            updatedKey.expires_at,
            ipAddress,
            hardwareName,
          );

          // 显示成功消息
          toast.success(`密钥${operationType}成功！`, {
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
          throw new Error(`${operationType}成功但未返回过期时间`);
        }
      }
    } catch (err) {
      setError(`操作失败: ${(err as Error).message}`);
      toast.error(`操作失败: ${(err as Error).message}`, {
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
          <div className={styles["dialog-title"]}>激活应用</div>
          <div className="window-action-button" onClick={onClose}>
            <IconButton icon={<CloseIcon />} bordered title="关闭" />
          </div>
        </div>
        <div className={styles["dialog-content"]}>
          <p>请输入您的激活密钥以继续使用全部功能。</p>
          <div className={styles["form-group"]}>
            <label className={styles["input-label"]} htmlFor="activationKey">
              激活密钥:
            </label>
            <input
              id="activationKey"
              type="text"
              value={keyString.trim()}
              onChange={(e) => setKeyString(e.target.value)}
              className={`${styles["input-field"]} ${
                error ? styles.error : ""
              }`}
              placeholder="请输入您的激活密钥"
              autoFocus
            />
            {error && <div className={styles["error-message"]}>{error}</div>}
          </div>
          <div className={styles["info-text"]}>
            注意：激活将自动获取您的设备信息，用于验证密钥有效性。
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
            onClick={handleActivateKey}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <LoadingIcon />
                激活中...
              </>
            ) : (
              "激活"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivateKeyDialog;
