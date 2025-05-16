import React, { useState, createContext, useContext, useCallback } from "react";
import { isActivated } from "./activation";
import ActivateKeyDialog from "./ActivateKeyDialog";

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
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // 检查激活状态函数
  const checkActivation = useCallback((action: () => void) => {
    if (!isActivated()) {
      // 保存要执行的操作
      setPendingAction(() => action);
      // 显示激活对话框
      setShowActivateDialog(true);
      return false;
    }
    // 如果已激活，直接执行操作
    action();
    return true;
  }, []);

  return (
    <ActivationContext.Provider value={{ checkActivation }}>
      {children}

      {/* 激活对话框 */}
      {showActivateDialog && (
        <ActivateKeyDialog
          isOpen={showActivateDialog}
          onClose={() => setShowActivateDialog(false)}
          onSuccess={() => {
            // 激活成功后执行保存的操作
            if (pendingAction) {
              pendingAction();
              setPendingAction(null);
            }
          }}
        />
      )}
    </ActivationContext.Provider>
  );
};

export default ActivationProvider;
