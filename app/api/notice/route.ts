import {
  getAllNotices,
  getActiveNotice,
  createNotice,
  updateNotice,
  deleteNotice,
  toggleNoticeStatus,
  type Notice,
} from "./notice-service";
import { NextRequest, NextResponse } from "next/server";

// 获取所有通知
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // 判断是否只获取活跃通知
  const activeOnly = searchParams.get("active") === "true";

  if (activeOnly) {
    const result = getActiveNotice();
    return NextResponse.json(result);
  } else {
    const result = getAllNotices();
    return NextResponse.json(result);
  }
}

// 创建新通知
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 验证必要字段
    if (!body.title || !body.content) {
      return NextResponse.json(
        { success: false, error: "标题和内容不能为空" },
        { status: 400 },
      );
    }

    const notice: Notice = {
      title: body.title,
      content: body.content,
      is_active: body.is_active ?? false, // 默认为非活跃
    };

    const result = createNotice(notice);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error) {
    console.error("创建通知处理错误:", error);
    return NextResponse.json(
      { success: false, error: "创建通知失败" },
      { status: 500 },
    );
  }
}

// 更新通知
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // 验证ID
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "缺少通知ID" },
        { status: 400 },
      );
    }

    const id = Number(body.id);
    const notice: Partial<Notice> = {};

    if (body.title !== undefined) notice.title = body.title;
    if (body.content !== undefined) notice.content = body.content;
    if (body.is_active !== undefined) notice.is_active = body.is_active;

    const result = updateNotice(id, notice);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    console.error("更新通知处理错误:", error);
    return NextResponse.json(
      { success: false, error: "更新通知失败" },
      { status: 500 },
    );
  }
}

// 删除通知
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "缺少通知ID" },
        { status: 400 },
      );
    }

    const result = deleteNotice(Number(id));

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    console.error("删除通知处理错误:", error);
    return NextResponse.json(
      { success: false, error: "删除通知失败" },
      { status: 500 },
    );
  }
}

// 切换通知状态
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    // 验证ID
    if (!body.id) {
      return NextResponse.json(
        { success: false, error: "缺少通知ID" },
        { status: 400 },
      );
    }

    const id = Number(body.id);
    const isActive = !!body.is_active;

    const result = toggleNoticeStatus(id, isActive);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 404 });
    }
  } catch (error) {
    console.error("切换通知状态处理错误:", error);
    return NextResponse.json(
      { success: false, error: "切换通知状态失败" },
      { status: 500 },
    );
  }
}
