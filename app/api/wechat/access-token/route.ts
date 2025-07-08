import { NextRequest, NextResponse } from "next/server";
import { getWechatAccessToken } from "../service";

export async function GET(req: NextRequest) {
  try {
    const result = await getWechatAccessToken();
    
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    // 直接返回获取到的token，不进行缓存
    return NextResponse.json(result);
  } catch (error) {
    console.error("获取微信access_token失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "服务器错误",
        error: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
} 