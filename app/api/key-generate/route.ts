import { NextRequest, NextResponse } from "next/server";
import {
  getAllKeys,
  createKey,
  deleteKey,
  activateKey,
  getKeysByStatus,
  getKeyByString,
  updateExpiredKeys,
  revokeKey,
  pauseKey,
  resumeKey,
} from "@/app/api/key-generate/back-end-service/KeyService";
import { KeyStatus } from "../../constant";

// 获取所有密钥
export async function GET(request: NextRequest) {
  try {
    // 检查是否有状态查询参数
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");
    const keyString = searchParams.get("key");

    let keys;

    // 根据参数决定调用哪个服务函数
    if (keyString) {
      // 获取特定密钥
      const key = getKeyByString(keyString);
      return NextResponse.json(key || null);
    } else if (status) {
      // 按状态获取密钥
      switch (status) {
        case "inactive":
          keys = getKeysByStatus(KeyStatus.INACTIVE);
          break;
        case "active":
          keys = getKeysByStatus(KeyStatus.ACTIVE);
          break;
        case "expired":
          keys = getKeysByStatus(KeyStatus.EXPIRED);
          break;
        case "revoked":
          keys = getKeysByStatus(KeyStatus.REVOKED);
          break;
        case "paused":
          keys = getKeysByStatus(KeyStatus.PAUSED);
          break;
        default:
          keys = getAllKeys();
      }
    } else {
      // 获取所有密钥
      keys = getAllKeys();
    }

    return NextResponse.json(keys);
  } catch (error) {
    console.error("获取密钥失败:", error);
    return NextResponse.json(
      { error: `获取密钥失败: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

// 创建新密钥
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { expiresHours = 24, notes } = body;

    const newKey = createKey(expiresHours, notes);
    return NextResponse.json(newKey, { status: 201 });
  } catch (error) {
    console.error("创建密钥失败:", error);
    return NextResponse.json(
      { error: `创建密钥失败: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

// 更新密钥（激活、撤销、暂停或恢复密钥）
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyString, ipAddress, hardwareName, action } = body;

    // 如果是撤销操作
    if (action === "revoke") {
      if (!keyString) {
        return NextResponse.json({ error: "缺少密钥参数" }, { status: 400 });
      }

      const revokedKey = revokeKey(keyString);
      return NextResponse.json(revokedKey);
    }

    // 如果是暂停操作
    if (action === "pause") {
      if (!keyString) {
        return NextResponse.json({ error: "缺少密钥参数" }, { status: 400 });
      }

      const pausedKey = pauseKey(keyString);
      return NextResponse.json(pausedKey);
    }

    // 如果是恢复操作
    if (action === "resume") {
      if (!keyString) {
        return NextResponse.json({ error: "缺少密钥参数" }, { status: 400 });
      }

      const resumedKey = resumeKey(keyString);
      return NextResponse.json(resumedKey);
    }

    // 默认为激活操作
    if (!keyString || !ipAddress || !hardwareName) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const updatedKey = activateKey(keyString, ipAddress, hardwareName);
    return NextResponse.json(updatedKey);
  } catch (error) {
    console.error("更新密钥失败:", error);
    return NextResponse.json(
      { error: `更新密钥失败: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

// 删除密钥
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyString = searchParams.get("key");

    if (!keyString) {
      return NextResponse.json({ error: "缺少密钥参数" }, { status: 400 });
    }

    const success = deleteKey(keyString);
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "删除密钥失败，可能密钥不存在" },
        { status: 404 },
      );
    }
  } catch (error) {
    console.error("删除密钥失败:", error);
    return NextResponse.json(
      { error: `删除密钥失败: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}

// 更新过期密钥（补充API）
export async function PATCH(request: NextRequest) {
  try {
    const changedCount = updateExpiredKeys();
    return NextResponse.json({
      success: true,
      message: `成功更新 ${changedCount} 个过期密钥`,
    });
  } catch (error) {
    console.error("更新过期密钥失败:", error);
    return NextResponse.json(
      { error: `更新过期密钥失败: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
