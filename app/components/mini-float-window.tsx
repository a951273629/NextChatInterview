import React from "react";
import "./mini-float-window.scss";

interface MiniFloatWindowProps {
  onShow: () => void;
  isVisible: boolean;
}

export const MiniFloatWindow: React.FC<MiniFloatWindowProps> = ({
  onShow,
  isVisible,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="mini-float-window" onClick={onShow}>
      <div className="float-content">
        <div className="float-icon">🎤</div>
        <div className="float-text">点击返回</div>
      </div>
    </div>
  );
};
