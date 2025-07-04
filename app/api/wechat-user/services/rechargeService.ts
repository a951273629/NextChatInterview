import db from '@/app/db';
import { userService } from './userService';
import { keyManagementService, RechargeKey } from './key-management';

// 充值类型: key/wechat/admin
export enum RechargeType {
  KEY = 'key',        // 密钥充值
  WECHAT = 'wechat',  // 微信充值
  ADMIN = 'admin'   // 管理员充值
}

// 充值记录接口
export interface RechargeRecord {
  id?: number;
  user_id: number;
  key_id: number;
  amount: number;
  recharge_type: string;
  created_at?: Date;
}

/**
 * 充值服务类 - 处理密钥充值、余额管理等
 */
class RechargeService {


  /**
   * 通过ID获取密钥
   */
  getKeyById(id: number): RechargeKey {
    const key = db.prepare('SELECT * FROM recharge_keys WHERE id = ?').get(id) as RechargeKey | undefined;
    if (!key) {
      throw new Error(`充值密钥 ID ${id} 不存在`);
    }
    return key;
  }



  /**
   * 使用充值密钥
   */
  useKey(keyString: string, userId: number): { success: boolean; message: string; amount?: number } {
    // 查找密钥
    const key = keyManagementService.getKeyByKeyString(keyString);
    if (!key) {
      return { success: false, message: '充值密钥不存在' };
    }
    
    // 检查密钥是否已使用
    if (key.status === 'used') {
      return { success: false, message: '充值密钥已被使用' };
    }
    
    // 检查密钥是否被撤销
    if (key.status === 'revoked') {
      return { success: false, message: '充值密钥已被撤销' };
    }
    
    // 检查密钥是否过期
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return { success: false, message: '充值密钥已过期' };
    }
    
    try {
      // 开始事务
      db.prepare('BEGIN').run();
      
      // 更新密钥为已使用
      db.prepare(`
        UPDATE recharge_keys 
        SET status = 'used', updated_at = datetime('now')
        WHERE id = ?
      `).run(key.id);
      
      // 记录充值记录
      db.prepare(`
        INSERT INTO recharge_records (user_id, key_id, amount, recharge_type, status, created_at) 
        VALUES (?, ?, ?, ?, 'success', datetime('now'))
      `).run(userId, key.id, key.amount, RechargeType.KEY);
      
      // 增加用户余额
      const user = userService.getUserById(userId);
      userService.updateUser({
        id: userId,
        balance: user.balance + key.amount
      });
      
      // 提交事务
      db.prepare('COMMIT').run();
      
      return { 
        success: true, 
        message: `充值成功，已增加 ${key.amount} 余额`, 
        amount: key.amount 
      };
    } catch (error) {
      // 出错时回滚
      db.prepare('ROLLBACK').run();
      console.error('充值错误:', error);
      return { 
        success: false, 
        message: '充值过程中发生错误，请稍后重试'
      };
    }
  }

  /**
   * 获取用户的充值记录
   */
  getUserRechargeRecords(userId: number): RechargeRecord[] {
    return db.prepare(`
      SELECT r.*, k.key_string, k.amount 
      FROM recharge_records r
      JOIN recharge_keys k ON r.key_id = k.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `).all(userId) as RechargeRecord[];
  }

  /**
   * 获取所有充值记录
   */
  getAllRechargeRecords(): RechargeRecord[] {
    return db.prepare(`
      SELECT r.*, k.key_string, k.amount, u.nickname as user_nickname
      FROM recharge_records r
      JOIN recharge_keys k ON r.key_id = k.id
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `).all() as RechargeRecord[];
  }


}

// 导出单例实例
export const rechargeService = new RechargeService();
export default rechargeService; 