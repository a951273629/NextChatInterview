import { log } from "console";
import { NextRequest, NextResponse } from "next/server";

/**
 * Azure Speech 密钥验证接口
 * GET /api/azure?key=xxx&region=xxx
 */
export async function GET(request: NextRequest) {
  try {
    console.log("🔍 开始验证 Azure Speech 密钥...");

    // 从查询参数获取 key 和 region
    const { searchParams } = new URL(request.url);
    const subscriptionKey = searchParams.get('key');
    const region = searchParams.get('region');
    console.warn("subscriptionKey & region", subscriptionKey, region);

    // 参数验证
    if (!subscriptionKey) {
      return NextResponse.json({
        success: false,
        message: "缺少必需的参数: key"
      }, { status: 400 });
    }

    if (!region) {
      return NextResponse.json({
        success: false,
        message: "缺少必需的参数: region"

      }, { status: 400 });
    }

    // 构造 Azure Speech TTS 服务端点
    const ttsEndpoint = `https://${region}.tts.speech.microsoft.com`;
    console.log("TTS endpoint:", ttsEndpoint);
    
    // 验证配置有效性 - 通过获取语音列表来测试 TTS 服务连接
    const voicesUrl = `${ttsEndpoint}/cognitiveservices/voices/list`;
    
    const response = await fetch(voicesUrl, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error("❌ Azure Speech API 请求失败:", response.status, response.statusText);
      
      let message = "Azure Speech 服务连接失败";
      
      switch (response.status) {
        case 401:
          message = "Azure Speech Key 无效或已过期";
          break;
        case 403:
          message = "Azure Speech Key 权限不足";
          break;
        case 429:
          message = "Azure Speech 请求频率过高，已达到配额限制";
          break;
        case 404:
          message = "Azure Speech 服务端点不存在，请检查区域配置";
          break;
        default:
          message = `Azure Speech 服务错误 (${response.status})`;
      }

      return NextResponse.json({
        success: false,
        message: message
      });
    }

    // 获取可用语音列表以验证服务可用性
    const voices = await response.json();
    console.log("✅ Azure Speech 服务连接成功，可用语音数量:", voices.length);

    return NextResponse.json({
      success: true,
      message: "Azure Speech 密钥验证成功"
    });

  } catch (error) {
    console.error("❌ Azure Speech 密钥验证失败:", error);
    
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : "密钥验证失败"
    }, { status: 500 });
  }
}


