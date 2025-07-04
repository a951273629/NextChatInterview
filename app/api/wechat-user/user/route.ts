import { NextRequest, NextResponse } from "next/server";
import { userService } from "../services/userService";

/**
 * 创建或获取用户信息 API
 * 微信登录成功后调用此API
 */
export async function POST(req: NextRequest) {
  try {
    const { openid, userInfo } = await req.json();

    if (!openid) {
      return NextResponse.json(
        { success: false, message: "缺少openid参数" },
        { status: 400 }
      );
    }

    // 获取或创建用户
    const user = userService.getUserByOpenId(openid);

    // 如果提供了用户信息，更新用户资料
    if (userInfo) {
      userService.updateUserProfile(
        user.id as number,
        userInfo.nickName,
        userInfo.avatarUrl
      );
    }

    // 重新获取用户信息以确保最新数据
    const updatedUser = userService.getUserById(user.id as number);

    return NextResponse.json({
      success: true,
      message: "获取用户信息成功",
      user: {
        id: updatedUser.id,
        openid: updatedUser.openid,
        nickname: updatedUser.nickname,
        avatar_url: updatedUser.avatar_url,
        balance: updatedUser.balance,
        is_activated: updatedUser.is_activated,
      },
    });
  } catch (error) {
    console.error("创建用户失败:", error);
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

/**
 * 获取登录用户信息
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const openid = searchParams.get("openid");

    if (!openid) {
      return NextResponse.json(
        { success: false, message: "缺少openid参数" },
        { status: 400 }
      );
    }

    const user = userService.getUserByOpenId(openid);
    
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        openid: user.openid,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
        balance: user.balance,
        is_activated: user.is_activated,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "用户不存在" },
      { status: 404 }
    );
  }
} 