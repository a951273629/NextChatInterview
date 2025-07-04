/**
 * 扣费服务 - 处理基于模型类型的消费扣费
 */

import { WECHAT_USER_INFO_KEY } from "../constant";

// 模型价格配置（按次收费，单位：元）
const MODEL_PRICING: Record<string, number> = {
  'gpt-4.1': 10,
  'gpt-4o': 10,
  'chatgpt-4o-latest': 10,
  'o3-mini': 20,
  'deepseek-r1-250528': 10,
} as const;

// 默认价格（未配置模型的默认价格）
const DEFAULT_MODEL_PRICE = 5;

// 扣费结果接口
export interface BillingResult {
  success: boolean;
  message: string;
  balance?: number;
  error?: string;
}

// 扣费上下文接口
export interface BillingContext {
  type: 'chat' | 'mcp' | 'azure-speech';
  modelName?: string;
  toolName?: string;
  userOpenId?: string;
}

/**
 * 扣费服务类
 */
export class BillingService {
  /**
   * 获取用户openid
   * 从localStorage的微信用户信息中获取
   */
  private getUserOpenId(): string | null {
    try {
      // 优先从微信用户信息中获取openid（与其他组件保持一致）
      const userInfoStr = localStorage.getItem(WECHAT_USER_INFO_KEY);
      if (userInfoStr) {
        const userInfo = JSON.parse(userInfoStr);
        if (userInfo.openid) {
          return userInfo.openid;
        }
      }
      return null;
    } catch (error) {
      console.warn('[BillingService] Failed to get user openid:', error);
      return null;
    }
  }

  /**
   * 获取模型价格
   */
  private getModelPrice(modelName: string): number {
    return MODEL_PRICING[modelName] || DEFAULT_MODEL_PRICE;
  }

  /**
   * 调用扣费API
   */
  private async callConsumptionAPI(
    openid: string, 
    amount: number, 
    consumeType: string = 'chat'
  ): Promise<BillingResult> {
    try {

      const response = await fetch('/api/wechat-user/consumption', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openid,
          amount,
          consumeType,
        }),
      });

      const data = await response.json();
      console.log("billing result balance", data.balance);
      if (response.ok && data.success) {
        return {
          success: true,
          message: data.message || '扣费成功',
          balance: data.balance,
        };
      } else {
        return {
          success: false,
          message: data.message || '扣费失败',
          error: data.error,
        };
      }
      
      
    } catch (error) {
      console.error('[BillingService] API call failed:', error);
      return {
        success: false,
        message: '网络错误，请稍后重试',
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  /**
   * 聊天扣费
   */
  async chargeForChat(modelName: string): Promise<BillingResult> {
    // 获取用户openid
    const openid = this.getUserOpenId();
    
    if (!openid) {
      return {
        success: false,
        message: '请先登录后再使用',
        error: 'USER_NOT_LOGGED_IN',
      };
    }

    // 获取模型价格
    const amount = this.getModelPrice(modelName);

    // 调用扣费API
    return await this.callConsumptionAPI(openid, amount, 'chat');
  }

  /**
   * MCP工具扣费（预留接口）
   */
  async chargeForMcp(toolName: string): Promise<BillingResult> {
    const openid = this.getUserOpenId();
    
    if (!openid) {
      return {
        success: false,
        message: '请先登录后再使用',
        error: 'USER_NOT_LOGGED_IN',
      };
    }

    // MCP工具固定价格（可根据需要调整）
    const amount = 20;

    // 调用扣费API
    return await this.callConsumptionAPI(openid, amount, 'mcp');
  }

  /**
   * Azure Speech 扣费
   */
  async chargeForAzureSpeech(): Promise<BillingResult> {
    const openid = this.getUserOpenId();
    
    if (!openid) {
      return {
        success: false,
        message: '请先登录后再使用',
        error: 'USER_NOT_LOGGED_IN',
      };
    }

    // Azure Speech 固定价格：每次识别扣费2点
    const amount = 2;

    // 调用扣费API
    return await this.callConsumptionAPI(openid, amount, 'azure-speech');
  }

  /**
   * 通用扣费方法
   */
  async charge(context: BillingContext): Promise<BillingResult> {
    switch (context.type) {
      case 'chat':
        if (!context.modelName) {
          return {
            success: false,
            message: '模型名称不能为空',
            error: 'MISSING_MODEL_NAME',
          };
        }
        return await this.chargeForChat(context.modelName);
        
      case 'mcp':
        if (!context.toolName) {
          return {
            success: false,
            message: '工具名称不能为空',
            error: 'MISSING_TOOL_NAME',
          };
        }
        return await this.chargeForMcp(context.toolName);
        
      case 'azure-speech':
        return await this.chargeForAzureSpeech();
        
      default:
        return {
          success: false,
          message: '不支持的扣费类型',
          error: 'UNSUPPORTED_BILLING_TYPE',
        };
    }
  }

  /**
   * 获取模型价格信息（用于UI显示）
   */
  getModelPricing(): Record<string, number> {
    return { ...MODEL_PRICING };
  }

  /**
   * 检查用户是否已登录
   */
  isUserLoggedIn(): boolean {
    return this.getUserOpenId() !== null;
  }
}

// 导出单例实例
export const billingService = new BillingService();
export default billingService;
