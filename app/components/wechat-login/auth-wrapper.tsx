import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Path, WECHAT_USER_INFO_KEY } from "../../constant";
import { useAccessStore } from "../../store";
import { safeLocalStorage } from "../../utils";

// 不需要登录就可以访问的路径
const PUBLIC_PATHS = [
  Path.Home, 
  Path.HomePortal, 
  Path.Login, 
  Path.WechatLogin,
  Path.Auth
];

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const accessStore = useAccessStore();
  const storage = safeLocalStorage();

  useEffect(() => {
    // 检查当前路径是否需要登录
    const isPublicPath = PUBLIC_PATHS.includes(location.pathname as Path);

    // 检查是否已登录
    const userInfoStr = storage.getItem(WECHAT_USER_INFO_KEY);
    let isLoggedIn = false;
    
    if (userInfoStr && accessStore.wechatLoggedIn) {
      try {
        const userInfo = JSON.parse(userInfoStr);
        // 验证用户信息是否完整
        isLoggedIn = userInfo.openid && userInfo.user;
      } catch (error) {
        console.error("解析用户信息失败:", error);
        // 清除无效的用户信息
        storage.removeItem(WECHAT_USER_INFO_KEY);
        accessStore.update((state) => {
          state.wechatLoggedIn = false;
          state.accessToken = "";
        });
      }
    }

    // 如果需要登录但未登录，重定向到微信登录页
    if (!isPublicPath && !isLoggedIn) {
      navigate(Path.WechatLogin);
    }
  }, [location.pathname, navigate, accessStore.wechatLoggedIn]);

  return <>{children}</>;
}
