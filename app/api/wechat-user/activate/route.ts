import { NextRequest, NextResponse } from "next/server";
import { userService } from "../services/userService";

/**
 * 激活或停用用户
 */
export async function POST(req: NextRequest) {
  try {
    const { openid, activate } = await req.json();

    if (!openid || activate === undefined) {
      return NextResponse.json(
        { success: false, message: "缺少必要参数" },
        { status: 400 }
      );
    }

    const user = userService.getUserByOpenId(openid);

    // 激活或停用用户
    const updatedUser = activate 
      ? userService.activateUser(user.id as number)
      : userService.deactivateUser(user.id as number);

    return NextResponse.json({
      success: true,
      message: activate ? "用户已激活" : "用户已停用",
      user: {
        id: updatedUser.id,
        openid: updatedUser.openid,
        balance: updatedUser.balance,
        is_activated: updatedUser.is_activated,
        activated_at: updatedUser.activated_at,
      },
    });
  } catch (error) {
    console.error("用户激活状态更新失败:", error);
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