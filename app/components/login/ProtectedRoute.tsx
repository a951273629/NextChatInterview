"use client";

import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loading } from "../home";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 检查服务器端session
        const response = await fetch("/api/auth-check");
        const data = await response.json();
        
        // 同时检查客户端存储
        const sessionStatus = sessionStorage.getItem("loginStatus");
        
        if (data.authenticated && sessionStatus === "authenticated") {
          setIsAuthenticated(true);
          
          // 获取路由传递的状态数据
          const stateData = location.state;
          if (stateData) {
            setRouteData(stateData);
            console.log("接收到的路由数据:", stateData);
          }
          
          // 获取sessionStorage中的数据
          const storageData = {
            loginTime: sessionStorage.getItem("loginTime"),
            loginStatus: sessionStorage.getItem("loginStatus")
          };
          console.log("SessionStorage数据:", storageData);
          
        } else {
          setIsAuthenticated(false);
          // 保存当前路径，登录后重定向回来
          navigate("/login", { 
            state: { from: location },
            replace: true 
          });
        }
      } catch (error) {
        console.error("认证检查失败:", error);
        setIsAuthenticated(false);
        navigate("/login", { 
          state: { from: location },
          replace: true 
        });
      }
    };

    checkAuth();
  }, [navigate, location]);

  // 显示加载状态
  if (isAuthenticated === null) {
    return <Loading />;
  }

  // 如果未认证，返回null（将重定向到登录页）
  if (!isAuthenticated) {
    return null;
  }

  // 如果已认证，渲染子组件，并传递路由数据
  return (
    <div>
      {/* 可选：显示路由传递的数据 */}
      {routeData && (
        <div style={{ 
          padding: "10px", 
          background: "#f0f0f0", 
          marginBottom: "10px",
          borderRadius: "4px"
        }}>
          <small>
            用户: {routeData.user} | 
            登录时间: {routeData.loginTime ? new Date(routeData.loginTime).toLocaleString() : "未知"}
          </small>
        </div>
      )}
      {children}
    </div>
  );
} 