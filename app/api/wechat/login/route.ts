import { NextRequest, NextResponse } from "next/server";

// 微信小程序配置
const WECHAT_CONFIG = {
  appid: "wx3e5b0d3ee0d22730",
  secret: "319727a552d580a31697356358945c41",
};

export async function POST(req: NextRequest) {
  try {
    const requestBody = await req.json();
    console.log("收到小程序登录请求:", requestBody);

    const { code, userInfo, scene } = requestBody;

    if (!code || !scene) {
      return NextResponse.json(
        {
          success: false,
          message: "缺少必要的登录参数",
        },
        { status: 400 }
      );
    }

    console.log("解析参数:", { code, scene, userInfo: userInfo?.nickName });

    // 调用微信API验证登录凭证
    const loginUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_CONFIG.appid}&secret=${WECHAT_CONFIG.secret}&js_code=${code}&grant_type=authorization_code`;

    const response = await fetch(loginUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (data.errcode) {
      return NextResponse.json(
        {
          success: false,
          message: "登录验证失败",
          error: data.errmsg,
          errcode: data.errcode,
        },
        { status: 400 }
      );
    }

    // 生成自定义登录态
    const loginToken = `wx_${data.openid}_${Date.now()}`;

    // 这里可以将用户信息存储到数据库
    // 目前返回基本信息
    const loginData = {
      openid: data.openid,
      unionid: data.unionid,
      session_key: data.session_key, // 注意：实际应用中不应该返回session_key给前端
      userInfo: userInfo,
      scene: scene,
      loginTime: new Date().toISOString()
    };
    
    console.log("登录成功，用户信息:", loginData);
    
    // TODO: 这里可以存储到数据库或缓存中
    // 暂时将登录状态存储在内存中（生产环境需要使用数据库）
    const globalAny = global as any;
    globalAny.loginSessions = globalAny.loginSessions || {};
    globalAny.loginSessions[scene] = loginData;
    
    return NextResponse.json({
      success: true,
      message: "登录成功",
      data: loginData,
    });
  } catch (error) {
    console.error("微信登录验证失败:", error);
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