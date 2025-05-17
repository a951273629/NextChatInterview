"use client";

import { NoticeSet } from "../components/notice/notice-set";

// 从导航栏手动输入 进入的路由方式， React Touter只能从页面点击进入。
export default function SetNoticePage() {
  return <NoticeSet />;
}
