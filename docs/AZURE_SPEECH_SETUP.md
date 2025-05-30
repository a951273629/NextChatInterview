# Azure Speech SDK 配置指南

## 概述
本项目使用 Azure Cognitive Services Speech SDK 进行实时语音识别，支持系统音频捕获和转录功能。

## 配置步骤

### 1. 创建 Azure Speech 服务
1. 访问 [Azure Portal](https://portal.azure.com)
2. 创建新的认知服务资源
3. 选择 "语音" 服务
4. 获取订阅密钥和区域信息

### 2. 配置环境变量
在项目根目录创建 `.env.local` 文件，添加以下配置：

```bash
# Azure Speech Service Configuration
NEXT_PUBLIC_AZURE_SPEECH_KEY=your_azure_speech_subscription_key_here
NEXT_PUBLIC_AZURE_SPEECH_REGION=your_azure_region_here
```

### 3. 示例配置
```bash
# 示例配置（请替换为你的实际密钥）
NEXT_PUBLIC_AZURE_SPEECH_KEY=abcd1234567890abcd1234567890abcd
NEXT_PUBLIC_AZURE_SPEECH_REGION=Southeast Asia
```

## 支持的区域
- eastus (美国东部)
- westus (美国西部)
- eastasia (东亚)
- southeastasia (东南亚)
- 更多区域请参考 [Azure 文档](https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/regions)

## 功能特点
- ✅ 实时语音识别
- ✅ 支持系统音频捕获
- ✅ 连续识别模式
- ✅ 多语言支持
- ✅ 高精度转录

## 故障排除

### 常见错误
1. **配置缺失错误**
   - 确保环境变量正确设置
   - 检查 `.env.local` 文件是否存在

2. **网络连接错误**
   - 检查网络连接
   - 确认 Azure 服务可访问

3. **权限错误**
   - 确保录屏权限已授予
   - 检查浏览器音频权限

### 调试提示
- 打开浏览器开发者工具查看控制台日志
- 确认 MediaStream 正常工作
- 验证 Azure 密钥有效性 