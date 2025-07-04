import { NextRequest, NextResponse } from "next/server";

// 微信小程序配置
const WECHAT_CONFIG = {
  appid: "wx3e5b0d3ee0d22730",
  secret: "319727a552d580a31697356358945c41",
};

export async function GET(req: NextRequest) {
  try {
    // 直接调用微信稳定版API获取access_token，不使用缓存
    const url = `https://api.weixin.qq.com/cgi-bin/stable_token`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credential",
        appid: WECHAT_CONFIG.appid,
        secret: WECHAT_CONFIG.secret,
        force_refresh: true
      }),
    });

    const data = await response.json();

    if (data.errcode) {
      return NextResponse.json(
        {
          success: false,
          message: "获取access_token失败",
          error: data.errmsg,
          errcode: data.errcode,
        },
        { status: 400 }
      );
    }

    // 直接返回获取到的token，不进行缓存
    return NextResponse.json({
      success: true,
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
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