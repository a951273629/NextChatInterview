// 消费记录接口
export interface ConsumptionRecord {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

// 消费结果接口
export interface ConsumptionResult {
  success: boolean;
  message: string;
  balance?: number;
}

/**
 * 消费服务客户端
 */
export class ConsumeService {
  private baseUrl = '/api/wechat-user/consumption';

  /**
   * 手动消费
   */
  async manualConsumption(
    openid: string,
    amount: number,
    description: string = '手动消费'
  ): Promise<ConsumptionResult> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openid,
          amount,
          description,
        }),
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('消费API调用失败:', error);
      return {
        success: false,
        message: '网络错误，请稍后重试',
      };
    }
  }

  /**
   * 获取用户消费记录
   */
  async getConsumptionRecords(openid: string): Promise<{
    success: boolean;
    records?: ConsumptionRecord[];
    message?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}?openid=${encodeURIComponent(openid)}`, {
        method: 'GET',
      });

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('获取消费记录失败:', error);
      return {
        success: false,
        message: '网络错误，请稍后重试',
      };
    }
  }
}

// 导出单例实例
export const consumeService = new ConsumeService();
export default consumeService;
