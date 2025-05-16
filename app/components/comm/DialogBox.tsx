import React, { useEffect, useRef } from "react";
import "./DialogBox.scss";

interface DialogBoxProps {
  title: string;
  content: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  isOpen: boolean;
}

const DialogBox: React.FC<DialogBoxProps> = ({
  title,
  content,
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  onCancel,
  isOpen,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // 处理点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dialogRef.current &&
        !dialogRef.current.contains(event.target as Node)
      ) {
        onCancel?.();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onCancel]);

  // 处理ESC键关闭
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel?.();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay">
      <div className="dialog-container" ref={dialogRef}>
        <div className="dialog-header">
          <h3>{title}</h3>
          <button className="dialog-close-button" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="dialog-content">{content}</div>
        <div className="dialog-footer">
          {onCancel && (
            <button className="dialog-button cancel-button" onClick={onCancel}>
              {cancelText}
            </button>
          )}
          {onConfirm && (
            <button
              className="dialog-button confirm-button"
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DialogBox;
