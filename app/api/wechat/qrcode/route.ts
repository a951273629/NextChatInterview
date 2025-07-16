import { NextRequest, NextResponse } from "next/server";
import { getWechatAccessToken } from "../service";

export async function POST(req: NextRequest) {
  console.log("=== 开始处理微信小程序码生成请求 ===");
  
  try {
    // 记录请求信息
    const requestBody = await req.json();
    
    const { scene = "test_login", page = "pages/login",env_version="trial" } = requestBody;
    // 直接调用获取access_token函数（避免内部fetch调用和SSL问题）
    const tokenData = await getWechatAccessToken();

    if (!tokenData.success) {

      return NextResponse.json(
        {
          success: false,
          message: "获取access_token失败",
          error: tokenData.error || tokenData.message,
          errcode: tokenData.errcode,
        },
        { status: 400 }
      );
    }

    console.log("✅ 成功获取access_token:", tokenData.access_token);

    // 生成小程序码
    const qrcodeUrl = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${tokenData.access_token}`;
    console.log("正在调用微信小程序码API，URL:", qrcodeUrl);

    const qrcodePayload = {
      scene,
      page,
      env_version,
      width: 280,
      auto_color: false,
      line_color: { r: 0, g: 0, b: 0 },
    };
    console.log("小程序码请求参数:", qrcodePayload);

    const qrcodeResponse = await fetch(qrcodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(qrcodePayload),
    });

    console.log("微信小程序码API响应状态:", qrcodeResponse.status);
    console.log("微信小程序码API响应头:", Object.fromEntries(qrcodeResponse.headers.entries()));

    // 检查响应是否是图片数据
    const contentType = qrcodeResponse.headers.get("content-type");
 
    
    if (contentType && contentType.includes("application/json")) {
      // 如果返回的是JSON，说明有错误
      const errorData = await qrcodeResponse.json();
      console.log("❌ 微信API返回错误:", errorData);
      return NextResponse.json(
        {
          success: false,
          message: "生成小程序码失败",
          error: errorData.errmsg,
          errcode: errorData.errcode,
        },
        { status: 400 }
      );
    }

    // 获取图片数据
    console.log("正在处理图片数据...");
    const imageBuffer = await qrcodeResponse.arrayBuffer();
    console.log("图片数据大小:", imageBuffer.byteLength, "bytes");
    
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    console.log("Base64编码长度:", imageBase64.length);

    const result = {
      success: true,
      qrcode: `data:image/png;base64,${imageBase64}`,
      scene,
      page,
    };
    
    console.log("✅ 成功生成小程序码, scene:", scene, "page:", page, "env_version:", env_version);
    console.log("=== 微信小程序码生成请求完成 ===");
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ 生成微信小程序码失败:", error);
    console.error("错误堆栈:", error instanceof Error ? error.stack : "无堆栈信息");
    console.log("=== 微信小程序码生成请求失败 ===");
    
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