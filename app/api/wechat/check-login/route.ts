import { NextRequest, NextResponse } from "next/server";

// GET 方法：检查登录状态
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scene = searchParams.get('scene');

    if (!scene) {
      return NextResponse.json(
        {
          success: false,
          message: "缺少scene参数",
        },
        { status: 400 }
      );
    }

    console.log("检查登录状态, scene:", scene);

    // 获取全局登录会话存储
    const globalAny = global as any;
    const loginSessions = globalAny.loginSessions || {};
    
    // 检查是否存在该scene的登录数据
    const loginData = loginSessions[scene];
    
    if (loginData) {
      console.log("用户已完成登录:", loginData);
      return NextResponse.json({
        success: true,
        loggedIn: true,
        data: loginData,
        message: "用户已登录"
      });
    } else {
      console.log("用户尚未登录, scene:", scene);
      return NextResponse.json({
        success: true,
        loggedIn: false,
        message: "用户尚未登录"
      });
    }
  } catch (error) {
    console.error("检查登录状态失败:", error);
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

// DELETE 方法：清理登录状态
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scene = searchParams.get('scene');

    if (!scene) {
      return NextResponse.json(
        {
          success: false,
          message: "缺少scene参数",
        },
        { status: 400 }
      );
    }

    console.log("清理登录状态, scene:", scene);

    // 获取全局登录会话存储
    const globalAny = global as any;
    if (globalAny.loginSessions && globalAny.loginSessions[scene]) {
      delete globalAny.loginSessions[scene];
      console.log("登录状态已清理");
    }

    return NextResponse.json({
      success: true,
      message: "登录状态已清理"
    });
  } catch (error) {
    console.error("清理登录状态失败:", error);
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