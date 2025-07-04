import { NextRequest, NextResponse } from "next/server";
import { consumptionService, ConsumeType } from "../services/consumptionService";
import { userService } from "../services/userService";

/**
 * 获取用户消费记录
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
    const records = consumptionService.getUserConsumptionRecords(user.id as number);

    return NextResponse.json({
      success: true,
      records: records.map(record => ({
        id: record.id,
        amount: record.amount,
        consume_type: record.consume_type,
        created_at: record.created_at,
      })),
    });
  } catch (error) {
    console.error("获取消费记录失败:", error);
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
 * 手动消费
 */
export async function POST(req: NextRequest) {
  try {
    const { openid, amount, consumeType } = await req.json();

    // 参数验证
    if (!openid || typeof openid !== 'string') {
      return NextResponse.json(
        { success: false, message: "缺少有效的 openid 参数" },
        { status: 400 }
      );
    }

    if (!amount || typeof amount !== 'number' && typeof amount !== 'string') {
      return NextResponse.json(
        { success: false, message: "缺少有效的 amount 参数" },
        { status: 400 }
      );
    }

    const numericAmount = parseFloat(amount.toString());
    
    // 验证金额有效性
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { success: false, message: "金额必须为正数" },
        { status: 400 }
      );
    }

    const user = userService.getUserByOpenId(openid);
    const consumptionResult = consumptionService.manualConsumption(
      user.id as number,
      numericAmount,
      consumeType || ConsumeType.TIME
    );

    if (consumptionResult.success) {
      return NextResponse.json({
        success: true,
        message: consumptionResult.message,
        balance: consumptionResult.balance,
      });
    } else {
      return NextResponse.json(
        { success: false, message: consumptionResult.message },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("消费处理失败:", error);
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