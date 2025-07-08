"use client";

import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styles from "./login.module.scss";
import { IconButton } from "../button";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (data.success) {
        setIsLoggedIn(true);
        setError("");
        
        // 存储登录状态到sessionStorage，用于路由间传递
        sessionStorage.setItem("loginStatus", "authenticated");
        sessionStorage.setItem("loginTime", new Date().toISOString());
        
        // 检查是否有重定向路径
        const redirectPath = location.state?.from?.pathname || null;
        if (redirectPath) {
          navigate(redirectPath, { replace: true });
        }
      } else {
        setError(data.message || "登录失败");
      }
    } catch (error) {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToSetNotice = () => {
    // 使用navigate传递状态
    navigate("/login/set-notice", {
      state: {
        from: location.pathname,
        loginTime: sessionStorage.getItem("loginTime"),
        user: "admin"
      }
    });
  };

  const handleNavigateToKeyManagement = () => {
    // 使用navigate传递状态到密钥管理页面
    navigate("/login/key-management", {
      state: {
        from: location.pathname,
        loginTime: sessionStorage.getItem("loginTime"),
        user: "admin"
      }
    });
  };

  const handleNavigateToUserManagement = () => {
    // 使用navigate传递状态到用户管理页面
    navigate("/login/user-management", {
      state: {
        from: location.pathname,
        loginTime: sessionStorage.getItem("loginTime"),
        user: "admin"
      }
    });
  };



  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <h2 className={styles.title}>管理员登录</h2>
        
        {!isLoggedIn ? (
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="password">密码:</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                placeholder="请输入密码"
                required
              />
            </div>
            
            {error && <div className={styles.error}>{error}</div>}
            
            <button
              type="submit"
              className={styles.loginButton}
              disabled={loading || !password}
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </form>
        ) : (
          <div className={styles.navigationSection}>
            <div className={styles.successMessage}>
              ✅ 登录成功！请选择要访问的功能：
            </div>
            <div className={styles.navButtons}>
              <IconButton
                text="通知设置"
                onClick={handleNavigateToSetNotice}
              />
              <IconButton
                text="秘钥管理"
                onClick={handleNavigateToKeyManagement}
              />
              <IconButton
                text="用户管理"
                onClick={handleNavigateToUserManagement}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
