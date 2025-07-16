import { NextRequest, NextResponse } from "next/server";
import { getAzureSpeechEnvironmentConfig, removeKeyRegionPair, refreshKeyRegionCache } from "@/app/api/azure/config";

/**
 * GET /api/azure/config
 * 获取 Azure Speech 环境配置
 */
export async function GET(request: NextRequest) {
  try {

    // 获取配置
    const config = getAzureSpeechEnvironmentConfig();
    
    return NextResponse.json({
      success: true,
      data: {
        key: config.key,
        region: config.region,
        keyCount: config.key.length,
        regionCount: config.region.length
      }
    });
  } catch (error) {
    console.error("❌ 获取 Azure Speech 配置失败:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
        message: "获取 Azure Speech 配置时发生错误"
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/azure/config
 * 移除指定的 key-region 对
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetKey = searchParams.get('key');
    const targetRegion = searchParams.get('region');

    if (!targetKey || !targetRegion) {
      return NextResponse.json(
        {
          success: false,
          error: "缺少必要参数",
          message: "请提供 key 和 region 参数"
        },
        { status: 400 }
      );
    }

    const removed = removeKeyRegionPair(targetKey, targetRegion);
    
    return NextResponse.json({
      success: true,
      data: {
        removed,
        message: removed ? "成功移除 key-region 对" : "未找到指定的 key-region 对"
      }
    });
  } catch (error) {
    console.error("❌ 移除 key-region 对失败:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
        message: "移除 key-region 对时发生错误"
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/azure/config/refresh
 * 刷新配置缓存
 */
export async function POST(request: NextRequest) {
  try {
    const { pathname } = new URL(request.url);
    
    if (pathname.endsWith('/refresh')) {
      refreshKeyRegionCache();
      
      return NextResponse.json({
        success: true,
        data: {
          message: "配置缓存已刷新"
        }
      });
    }
    
    return NextResponse.json(
      {
        success: false,
        error: "不支持的操作",
        message: "请使用正确的端点"
      },
      { status: 404 }
    );
  } catch (error) {
    console.error("❌ 刷新配置缓存失败:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
        message: "刷新配置缓存时发生错误"
      },
      { status: 500 }
    );
  }
}