import { NextRequest, NextResponse } from "next/server";

// 微信小程序配置
const WECHAT_CONFIG = {
  appid: "wx3e5b0d3ee0d22730",
  secret: "319727a552d580a31697356358945c41",
};

// 内存缓存access_token
let tokenCache: {
  access_token: string;
  expires_at: number;
} | null = null;

export async function GET(req: NextRequest) {
  try {
    // 检查缓存的token是否有效（提前5分钟过期）
    if (tokenCache && tokenCache.expires_at > Date.now() + 5 * 60 * 1000) {
      return NextResponse.json({
        success: true,
        access_token: tokenCache.access_token,
        expires_in: Math.floor((tokenCache.expires_at - Date.now()) / 1000),
      });
    }

    // 调用微信稳定版API获取access_token
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
        force_refresh: false
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

    // 缓存token
    tokenCache = {
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
    };

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