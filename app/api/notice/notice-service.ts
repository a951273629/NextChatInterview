import db from "../../db";

// 通知类型定义
export interface Notice {
  id?: number;
  title: string;
  content: string;
  created_at?: number;
  updated_at?: number;
  is_active: boolean;
}

// 获取所有通知
export function getAllNotices() {
  try {
    const notices = db
      .prepare("SELECT * FROM notices ORDER BY created_at DESC")
      .all();
    return { success: true, data: notices };
  } catch (error) {
    console.error("获取通知列表失败:", error);
    return { success: false, error: "获取通知列表失败" };
  }
}

// 获取活跃的通知
export function getActiveNotice() {
  try {
    const notice = db
      .prepare(
        "SELECT * FROM notices WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1",
      )
      .get();
    return { success: true, data: notice || null };
  } catch (error) {
    console.error("获取活跃通知失败:", error);
    return { success: false, error: "获取活跃通知失败" };
  }
}

// 创建通知
export function createNotice(notice: Notice) {
  try {
    // 获取当前时间戳
    const now = Math.floor(Date.now() / 1000);

    // 先将其他通知设为非活跃状态
    if (notice.is_active) {
      db.prepare("UPDATE notices SET is_active = 0").run();
    }

    const result = db
      .prepare(
        "INSERT INTO notices (title, content, created_at, updated_at, is_active) VALUES (?, ?, ?, ?, ?)",
      )
      .run(notice.title, notice.content, now, now, notice.is_active ? 1 : 0);

    return { success: true, data: { id: result.lastInsertRowid, ...notice } };
  } catch (error) {
    console.error("创建通知失败:", error);
    return { success: false, error: "创建通知失败" };
  }
}

// 更新通知
export function updateNotice(id: number, notice: Partial<Notice>) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // 先查询通知是否存在
    const existingNotice = db
      .prepare("SELECT * FROM notices WHERE id = ?")
      .get(id);
    if (!existingNotice) {
      return { success: false, error: "通知不存在" };
    }

    // 如果要将这个通知设为活跃状态，先将其他通知设为非活跃
    if (notice.is_active) {
      db.prepare("UPDATE notices SET is_active = 0").run();
    }

    // 构建更新语句
    const updateFields = [];
    const params = [];

    if (notice.title !== undefined) {
      updateFields.push("title = ?");
      params.push(notice.title);
    }

    if (notice.content !== undefined) {
      updateFields.push("content = ?");
      params.push(notice.content);
    }

    if (notice.is_active !== undefined) {
      updateFields.push("is_active = ?");
      params.push(notice.is_active ? 1 : 0);
    }

    // 添加更新时间
    updateFields.push("updated_at = ?");
    params.push(now);

    // 添加ID参数
    params.push(id);

    const result = db
      .prepare(`UPDATE notices SET ${updateFields.join(", ")} WHERE id = ?`)
      .run(...params);

    if (result.changes > 0) {
      return { success: true, data: { id, ...notice } };
    } else {
      return { success: false, error: "更新通知失败" };
    }
  } catch (error) {
    console.error("更新通知失败:", error);
    return { success: false, error: "更新通知失败" };
  }
}

// 删除通知
export function deleteNotice(id: number) {
  try {
    const result = db.prepare("DELETE FROM notices WHERE id = ?").run(id);

    if (result.changes > 0) {
      return { success: true };
    } else {
      return { success: false, error: "通知不存在" };
    }
  } catch (error) {
    console.error("删除通知失败:", error);
    return { success: false, error: "删除通知失败" };
  }
}

// 切换通知活跃状态
export function toggleNoticeStatus(id: number, isActive: boolean) {
  try {
    const now = Math.floor(Date.now() / 1000);

    // 如果要激活，先将所有通知设为非活跃
    if (isActive) {
      db.prepare("UPDATE notices SET is_active = 0").run();
    }

    const result = db
      .prepare("UPDATE notices SET is_active = ?, updated_at = ? WHERE id = ?")
      .run(isActive ? 1 : 0, now, id);

    if (result.changes > 0) {
      return { success: true };
    } else {
      return { success: false, error: "通知不存在" };
    }
  } catch (error) {
    console.error("切换通知状态失败:", error);
    return { success: false, error: "切换通知状态失败" };
  }
}
