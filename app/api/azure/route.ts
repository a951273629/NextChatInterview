import { NextRequest, NextResponse } from "next/server";
import { getAzureSpeechEnvironmentConfig } from "./config";

/**
 * Azure Speech 使用量检查接口
 * GET /api/azure/speech/usage
 */
export async function GET(request: NextRequest) {
  try {
    console.log("🔍 开始检查 Azure Speech 使用量...");

    // 获取 Azure Speech 配置
    const config = getAzureSpeechEnvironmentConfig();
    
    // 构造 Azure Speech TTS 服务端点 (修正端点格式)
    const ttsEndpoint = `https://${config.region}.tts.speech.microsoft.com`;
    const sttEndpoint = `https://${config.region}.stt.speech.microsoft.com`;
    console.log("config:",config.key,config.region);
    console.log("TTS endpoint:", ttsEndpoint);
    console.log("STT endpoint:", sttEndpoint);
    
    // 验证配置有效性 - 通过获取语音列表来测试 TTS 服务连接
    const voicesUrl = `${ttsEndpoint}/cognitiveservices/voices/list`;
    
    const response = await fetch(voicesUrl, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': config.key,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error("❌ Azure Speech API 请求失败:", response.status, response.statusText);
      
      let errorMessage = "Azure Speech 服务连接失败";
      
      switch (response.status) {
        case 401:
          errorMessage = "Azure Speech Key 无效或已过期";
          break;
        case 403:
          errorMessage = "Azure Speech Key 权限不足";
          break;
        case 429:
          errorMessage = "Azure Speech 请求频率过高，已达到配额限制";
          break;
        case 404:
          errorMessage = "Azure Speech TTS 服务端点不存在，请检查区域配置是否正确";
          break;
        default:
          errorMessage = `Azure Speech TTS 服务错误 (${response.status})`;
      }

      return NextResponse.json({
        success: false,
        error: errorMessage,
        details: {
          status: response.status,
          statusText: response.statusText,
          region: config.region,
          ttsEndpoint: ttsEndpoint,
          sttEndpoint: sttEndpoint,
        }
      }, { status: response.status });
    }

    // 获取可用语音列表以验证服务可用性
    const voices = await response.json();
    console.log("✅ Azure Speech 服务连接成功，可用语音数量:", voices.length);

    // 获取使用情况的基本信息
    const usageInfo = {
      success: true,
      message: "Azure Speech 服务连接正常",
      serviceInfo: {
        region: config.region,
        ttsEndpoint: ttsEndpoint,
        sttEndpoint: sttEndpoint,
        availableVoices: voices.length,
        keyStatus: "有效",
      },
      checkTime: new Date().toISOString(),
    };

    // console.log("📊 Azure Speech 使用量检查完成:", usageInfo);

    return NextResponse.json(usageInfo);

  } catch (error) {
    console.error("❌ Azure Speech 使用量检查失败:", error);
    
    return NextResponse.json({
      success: false,
      error: "Azure Speech 使用量检查失败",
      details: {
        message: error instanceof Error ? error.message : "未知错误",
        timestamp: new Date().toISOString(),
      }
    }, { status: 500 });
  }
}

/**
 * 获取详细的使用量信息 (需要额外的权限)
 * POST /api/azure/speech/usage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { includeMetrics = false } = body;

    console.log("🔍 获取详细的 Azure Speech 使用量信息...");

    const config = getAzureSpeechEnvironmentConfig();

    // 基础配置验证
    const basicCheck = await GET(request);
    const basicResult = await basicCheck.json();

    if (!basicResult.success) {
      return basicCheck;
    }

    // 如果需要获取指标数据 (需要 Azure Resource Manager API)
    let metricsData = null;
    if (includeMetrics) {
      // 注意：这需要额外的权限和配置
      // 实际项目中需要配置 Azure AD 应用程序和相应的权限
      console.log("⚠️ 指标数据获取需要额外的 Azure AD 权限配置");
      
      metricsData = {
        note: "详细指标数据需要配置 Azure AD 应用程序权限或使用 Azure Portal",
        portalMethod: {
          description: "推荐：直接使用 Azure Portal 查看使用量",
          steps: [
            "1. 登录 Azure Portal",
            "2. 导航到 Speech 服务资源",
            "3. 选择监控 > 指标",
            "4. 选择 'Synthesized Characters' 查看 TTS 使用量"
          ]
        },
        apiMethod: {
          description: "高级：通过 API 获取指标数据",
          requirements: [
            "1. 在 Azure Portal 创建应用程序注册",
            "2. 配置 API 权限：Azure Service Management",
            "3. 使用 Azure Resource Manager API 或 Azure Monitor API"
          ],
          exampleEndpoints: {
            resourceManager: `https://management.azure.com/subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.CognitiveServices/accounts/{account-name}/usages`,
            monitor: `https://management.azure.com/subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.CognitiveServices/accounts/{account-name}/providers/Microsoft.Insights/metrics`,
          }
        }
      };
    }

    const detailedInfo = {
      ...basicResult,
      detailedMetrics: metricsData,
      recommendations: [
        "使用 Azure Portal 的指标功能监控 TTS 字符使用量",
        "定期检查 Azure Portal 中的使用量和账单",
        "设置 Azure 预算和警报来监控成本",
        "注意 TTS 按字符计费，中文等字符计为双倍",
        "考虑使用 Azure Cost Management API 进行成本跟踪",
        "对于高频使用场景，考虑申请配额提升",
        "使用正确的服务端点：TTS使用 {region}.tts.speech.microsoft.com",
      ],
    };

    return NextResponse.json(detailedInfo);

  } catch (error) {
    console.error("❌ 详细使用量检查失败:", error);
    
    return NextResponse.json({
      success: false,
      error: "详细使用量检查失败",
      details: {
        message: error instanceof Error ? error.message : "未知错误",
        timestamp: new Date().toISOString(),
      }
    }, { status: 500 });
  }
} 