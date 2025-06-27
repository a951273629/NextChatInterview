import React, { useState, createContext, useContext, useCallback, useEffect } from "react";
import * as keyService from "../../services/keyService";
import { isActivated, clearActivation, getRemainingTime, ACTIVATION_KEY_STRING } from "./activation";
import ActivateKeyDialog from "./ActivateKeyDialog";
import ResumeKeyDialog from "./ResumeKeyDialog";
import { safeLocalStorage } from "../../utils";
import { toast } from "react-hot-toast";

// 初始化localStorage
const localStorage = safeLocalStorage();

// 创建激活上下文
type ActivationContextType = {
  checkActivation: (action: () => void, extraTimeDeduction?: number) => Promise<boolean>;
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
  const [showDialog, setShowDialog] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // 检查激活状态函数
  const checkActivation = useCallback(async (action: () => void, extraTimeDeduction: number = 0): Promise<boolean> => {
    try {
      // 获取本地存储的密钥字符串
             const keyString = localStorage.getItem(ACTIVATION_KEY_STRING);
       if (!keyString) {
         setShowDialog(true);
         return false;
       }

       // 从服务器获取密钥状态
       const keyInfo = await keyService.getKeyByString(keyString.trim());
       
       if (!keyInfo) {
         setShowDialog(true);
         return false;
       }

       // 检查密钥状态
       if (keyInfo.status === "inactive" || keyInfo.status === "revoked") {
         setShowDialog(true);
         return false;
       } else if (keyInfo.status === "paused") {
         setShowResumeDialog(true);
         return false;
       } else if (keyInfo.status === "active") {
        // 密钥激活中，检查是否过期
        if (keyInfo.expires_at && keyInfo.expires_at > Date.now()) {
          // 检查剩余时间是否足够额外扣除
          if (extraTimeDeduction > 0) {
            const remainingTime = Math.floor((keyInfo.expires_at - Date.now()) / 1000);
            if (remainingTime < extraTimeDeduction) {
              toast.error(`剩余时间不足，需要 ${extraTimeDeduction} 秒，当前剩余 ${remainingTime} 秒`);
              return false;
            }

            // 调用服务器扣除时间
            try {
              const updatedKeyStatus = await keyService.deductKeyTime(keyString.trim(), extraTimeDeduction);
              if (updatedKeyStatus) {
                console.log(`时间扣除成功：${extraTimeDeduction}秒`);
              }
            } catch (error) {
              console.warn('时间扣除失败，但允许操作继续:', error);
              // 网络错误时允许操作继续，但记录错误
            }
          }

          action();
          return true;
        } else {
          // 密钥过期
          setShowDialog(true);
          return false;
        }
      } else {
        // 其他状态视为未激活
        setShowDialog(true);
        return false;
      }
    } catch (error) {
      console.error("检查激活状态失败:", error);
      setShowDialog(true);
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
      {showDialog && (
        <ActivateKeyDialog
          isOpen={showDialog}
          onClose={() => setShowDialog(false)}
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
