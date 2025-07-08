// 微信小程序配置
const WECHAT_CONFIG = {
    appid: "wx3e5b0d3ee0d22730",
    secret: "319727a552d580a31697356358945c41",
  };
  
  // 可复用的获取access_token函数
  export async function getWechatAccessToken() {
    console.log("=== 开始获取微信access_token ===");
    
    try {
      const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_CONFIG.appid}&secret=${WECHAT_CONFIG.secret}`;
      console.log("调用微信API URL:", url);
      
      const response = await fetch(url, {
        method: "GET",
        // headers: {
        //   "Content-Type": "application/json",
        // }
      });
  
      console.log("微信API响应状态:", response.status);
      const data = await response.json();
      console.log("微信API响应数据:", data);
  
      if (data.errcode) {
        console.log("❌ 获取access_token失败:", data.errmsg);
        return {
          success: false,
          message: "获取access_token失败",
          error: data.errmsg,
          errcode: data.errcode,
        };
      }
  
      console.log("✅ 成功获取access_token");
      return {
        success: true,
        access_token: data.access_token,
        expires_in: data.expires_in,
      };
    } catch (error) {
      console.error("❌ 获取微信access_token失败:", error);
      return {
        success: false,
        message: "服务器错误",
        error: error instanceof Error ? error.message : "未知错误",
      };
    } finally {
      console.log("=== 微信access_token获取完成 ===");
    }
  } 