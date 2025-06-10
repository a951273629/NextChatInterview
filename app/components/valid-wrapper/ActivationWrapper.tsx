import React, { useState, createContext, useContext, useCallback } from "react";
import { isActivated, isPaused } from "./activation";
import ActivateKeyDialog from "./ActivateKeyDialog";
import ResumeKeyDialog from "./ResumeKeyDialog";
import { safeLocalStorage } from "../../utils";

// 初始化localStorage
const localStorage = safeLocalStorage();

// 创建激活上下文
type ActivationContextType = {
  checkActivation: (action: () => void) => boolean;
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
  const checkActivation = useCallback((action: () => void) => {
    // 如果已激活，直接执行操作
    if (isActivated()) {
      action();
      return true;
    }
    
    // 如果是暂停状态，显示恢复弹窗
    if (isPaused()) {
      setPendingAction(() => action);
      setShowResumeDialog(true);
      return false;
    }
    
    // 否则显示激活弹窗
    setPendingAction(() => action);
    setShowActivateDialog(true);
    return false;
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
