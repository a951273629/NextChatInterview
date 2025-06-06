import React from "react";
import "./mini-float-window.scss";
import MicrophoneIcon from "@/app/icons/microphone.svg";
interface MiniFloatWindowProps {
  onShow: () => void;
  isVisible: boolean;
  text?: string;

}

export const MiniFloatWindow: React.FC<MiniFloatWindowProps> = ({
  onShow,
  isVisible,
  text = "点击返回",
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="mini-float-window" onClick={onShow}>
      <div className="float-content">
        {/* <div className="float-icon">{icon}</div>
         */}
         <MicrophoneIcon/>
        <div className="float-text">{text}</div>
      </div>
    </div>
  );
};
