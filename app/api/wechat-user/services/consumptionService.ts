import db from '@/app/db';
import { userService } from './userService';

// 消费类型枚举
export enum ConsumeType {
  TIME = 'time',    // 时间消费
  CHAT = 'chat',    // 聊天消费  
  MCP = 'mcp'       // MCP消费
}

// 消费记录接口
export interface ConsumptionRecord {
  id?: number;
  user_id: number;
  amount: number;
  consume_type: string;
  created_at?: Date;
}

/**
 * 消费服务类 - 处理用户消费记录
 */
class ConsumptionService {
  /**
   * 创建消费记录
   */
  createConsumptionRecord(
    userId: number,
    amount: number,
    consumeType: string
  ): ConsumptionRecord {
    const result = db.prepare(`
      INSERT INTO consumption_records (user_id, amount, consume_type, created_at) 
      VALUES (?, ?, ?, datetime('now'))
    `).run(userId, amount, consumeType);
    
    return this.getConsumptionRecordById(result.lastInsertRowid as number);
  }

  /**
   * 通过ID获取消费记录
   */
  getConsumptionRecordById(id: number): ConsumptionRecord {
    const record = db.prepare('SELECT * FROM consumption_records WHERE id = ?').get(id) as ConsumptionRecord | undefined;
    if (!record) {
      throw new Error(`消费记录 ID ${id} 不存在`);
    }
    return record;
  }

  /**
   * 获取用户消费记录
   */
  getUserConsumptionRecords(userId: number): ConsumptionRecord[] {
    return db.prepare(`
      SELECT * FROM consumption_records 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).all(userId) as ConsumptionRecord[];
  }

  /**
   * 手动消费
   */
  manualConsumption(
    userId: number,
    amount: number,
    consumeType: string = ConsumeType.TIME
  ): { success: boolean; message: string; balance?: number } {
    // 参数验证
    if (!Number.isInteger(userId) || userId <= 0) {
      return {
        success: false,
        message: '无效的用户ID'
      };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        success: false,
        message: '无效的消费金额'
      };
    }

    if (!consumeType || typeof consumeType !== 'string') {
      return {
        success: false,
        message: '无效的消费类型'
      };
    }

    try {
      // 使用 IMMEDIATE 事务避免并发问题
      db.prepare('BEGIN IMMEDIATE').run();
      
      // 获取用户信息（添加锁定读取）
      const user = userService.getUserById(userId);
      
      // 检查余额是否足够
      if (user.balance < amount) {
        db.prepare('ROLLBACK').run();
        return {
          success: false,
          message: `余额不足，当前余额: ${user.balance}，需要: ${amount}`
        };
      }
      
      // 扣除余额
      userService.updateUser({
        id: userId,
        balance: user.balance - amount
      });
      
      // 记录消费
      this.createConsumptionRecord(userId, amount, consumeType);
      
      // 提交事务
      db.prepare('COMMIT').run();
      
      return {
        success: true,
        message: `消费成功，已扣除 ${amount} `,
        balance: user.balance - amount
      };
    } catch (error) {
      // 出错时回滚
      db.prepare('ROLLBACK').run();
      console.error('消费处理失败:', error);
      return {
        success: false,
        message: `消费处理失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
}

// 导出单例实例
export const consumptionService = new ConsumptionService();
export default consumptionService; 