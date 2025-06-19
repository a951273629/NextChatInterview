import React, { useState, createContext, useContext, useCallback } from "react";
import { ACTIVATION_KEY_STRING } from "./activation";
import { getKeyByString } from "../../services/keyService";
import ActivateKeyDialog from "./ActivateKeyDialog";
import ResumeKeyDialog from "./ResumeKeyDialog";
import { safeLocalStorage } from "../../utils";

// 初始化localStorage
const localStorage = safeLocalStorage();

// 创建激活上下文
type ActivationContextType = {
  checkActivation: (action: () => void) => Promise<boolean>;
};

const ActivationContext = createContext<ActivationContextType | null>(null);

// 使用激活上下文的自定义钩子
export const useActivation = () => {
  const context = useContext(ActivationContext);
  if (!context) {
    throw new Error("useActivation must be used within an ActivationProvider");
  }
  return context;
};

// 激活状态提供者组件
export const ActivationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [showActivateDialog, setShowActivateDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // 检查激活状态函数
  const checkActivation = useCallback(async (action: () => void): Promise<boolean> => {
    try {
      // 获取本地存储的密钥字符串
      const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
      
      // 如果没有密钥字符串，显示激活弹窗
      if (!keyString?.trim()) {
        setPendingAction(() => action);
        setShowActivateDialog(true);
        return false;
      }
      
      // 从服务器获取密钥实时状态
      const keyInfo = await getKeyByString(keyString.trim());
      
      // 根据服务器状态决定操作
      if (keyInfo?.status === "active") {
        // 密钥激活中，检查是否过期
        if (keyInfo.expires_at && keyInfo.expires_at > Date.now()) {
          action();
          return true;
        } else {
          // 已过期，显示激活弹窗
          setPendingAction(() => action);
          setShowActivateDialog(true);
          return false;
        }
      } else if (keyInfo?.status === "paused") {
        // 密钥暂停，显示恢复弹窗
        setPendingAction(() => action);
        setShowResumeDialog(true);
        return false;
      } else {
        // 其他状态（expired, revoked, inactive 等），显示激活弹窗
        setPendingAction(() => action);
        setShowActivateDialog(true);
        return false;
      }
    } catch (error) {
      console.error("检查激活状态失败:", error);
      // 网络错误或其他异常，显示激活弹窗
      setPendingAction(() => action);
      setShowActivateDialog(true);
      return false;
    }
  }, []);

  // 处理激活成功后的回调
  const handleActivateSuccess = () => {
    setShowActivateDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // 处理恢复成功后的回调
  const handleResumeSuccess = () => {
    setShowResumeDialog(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  return (
    <ActivationContext.Provider value={{ checkActivation }}>
      {children}

      {/* 激活对话框 */}
      {showActivateDialog && (
        <ActivateKeyDialog
          isOpen={showActivateDialog}
          onClose={() => setShowActivateDialog(false)}
          onSuccess={handleActivateSuccess}
        />
      )}

      {/* 恢复对话框 */}
      {showResumeDialog && (
        <ResumeKeyDialog
          isOpen={showResumeDialog}
          onClose={() => setShowResumeDialog(false)}
          onSuccess={handleResumeSuccess}
        />
      )}
    </ActivationContext.Provider>
  );
};

export default ActivationProvider;
