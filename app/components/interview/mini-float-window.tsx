import React, { useState } from "react";
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
  const [position, setPosition] = useState({ x: window.innerWidth - 82, y: window.innerHeight - 178 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setStartPos({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // e.preventDefault();
    const touch = e.touches[0];
    setPosition({ x: touch.clientX - startPos.x, y: touch.clientY - startPos.y });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div 
      className="mini-float-window" 
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onClick={onShow}
    >
      <div className="float-content">
        {/* <div className="float-icon">{icon}</div>
         */}
         <MicrophoneIcon/>
        <div className="float-text">{text}</div>
      </div>
    </div>
  );
};
