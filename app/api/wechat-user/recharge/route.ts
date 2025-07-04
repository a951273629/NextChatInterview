import { NextRequest, NextResponse } from "next/server";
import { rechargeService } from "../services/rechargeService";
import { userService } from "../services/userService";

/**
 * 使用充值密钥
 */
export async function POST(req: NextRequest) {
  try {
    const { openid, key } = await req.json();

    if (!openid || !key) {
      return NextResponse.json(
        { success: false, message: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 获取用户信息
    const user = userService.getUserByOpenId(openid);

    // 使用充值密钥
    const rechargeResult = rechargeService.useKey(key, user.id as number);

    if (rechargeResult.success) {
      // 重新获取用户信息以获取更新后的余额
      const updatedUser = userService.getUserById(user.id as number);
      
      return NextResponse.json({
        success: true,
        message: rechargeResult.message,
        balance: updatedUser.balance,
        amount: rechargeResult.amount,
      });
    } else {
      return NextResponse.json(
        { success: false, message: rechargeResult.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("充值处理失败:", error);
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
 * 获取用户充值记录
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
    const records = rechargeService.getUserRechargeRecords(user.id as number);

    return NextResponse.json({
      success: true,
      records: records.map(record => ({
        id: record.id,
        amount: record.amount,
        created_at: record.created_at,
      })),
    });
  } catch (error) {
    console.error("获取充值记录失败:", error);
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