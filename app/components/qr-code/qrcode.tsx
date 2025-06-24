import React, { useState, useEffect } from 'react';

export interface QRCodeProps {
  /** 要编码到QR码中的文本 */
  text: string;
  /** QR码图像的大小（像素），默认150 */
  size?: number;
  /** 图像的alt属性 */
  alt?: string;
  /** 额外的CSS类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 加载时的占位符 */
  placeholder?: React.ReactNode;
  /** 错误时的回调 */
  onError?: (error: Error) => void;
  /** 加载完成时的回调 */
  onLoad?: () => void;
}

export const QRCode: React.FC<QRCodeProps> = ({
  text,
  size = 150,
  alt = 'QR Code',
  className,
  style,
  placeholder,
  onError,
  onLoad,
}) => {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!text) {
      setError(new Error('Text is required for QR code generation'));
      setLoading(false);
      return;
    }

    // 重置状态
    setLoading(true);
    setError(null);
    setImageUrl('');

    // 构建API URL
    const apiUrl = `/api/qrcode?text=${encodeURIComponent(text)}&size=${size}`;
    
    // 生成唯一的URL以避免缓存问题（如果需要）
    const timestamp = Date.now();
    const finalUrl = `${apiUrl}&t=${timestamp}`;

    // 创建一个新的Image对象来预加载图片
    const img = new Image();
    
    img.onload = () => {
      setImageUrl(finalUrl);
      setLoading(false);
      onLoad?.();
    };

    img.onerror = () => {
      const err = new Error('Failed to load QR code image');
      setError(err);
      setLoading(false);
      onError?.(err);
    };

    // 开始加载图片
    img.src = finalUrl;

    // 清理函数
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [text, size, onError, onLoad]);

  // 如果有错误，显示错误信息
  if (error) {
    return (
      <div 
        className={className}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          color: '#666',
          fontSize: '12px',
          textAlign: 'center',
          padding: '8px',
          ...style,
        }}
      >
        QR码生成失败
      </div>
    );
  }

  // 如果正在加载，显示占位符或默认加载状态
  if (loading) {
    return (
      <div 
        className={className}
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
          backgroundColor: '#f5f5f5',
          color: '#666',
          fontSize: '12px',
          ...style,
        }}
      >
        {placeholder || '生成中...'}
      </div>
    );
  }

  // 显示QR码图像
  return (
    <img
      src={imageUrl}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        ...style,
      }}
      draggable={false}
    />
  );
};

export default QRCode; 