import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    
    // 验证密码
    if (password !== "xiaoming") {
      return NextResponse.json(
        { success: false, message: "密码错误" },
        { status: 401 }
      );
    }

    // 创建响应并设置session cookie
    const response = NextResponse.json({
      success: true,
      message: "登录成功"
    });

    // 设置session cookie (有效期1小时)
    response.cookies.set("session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 360000 // 1小时
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "服务器错误" },
      { status: 500 }
    );
  }
} 