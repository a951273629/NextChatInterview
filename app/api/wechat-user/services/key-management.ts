import db from '@/app/db';

// 密钥接口定义
export interface RechargeKey {
  id?: number;
  key_string: string;
  amount: number;
  status: 'active' | 'used' | 'revoked';
  expires_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
  notes?: string;
}

// 创建密钥参数
export interface CreateKeyParams {
  amount: number;
  notes?: string;
}

// 批量创建参数
export interface BatchCreateParams {
  count: number;
  amount: number;
  notes?: string;
}

// 查询过滤器
export interface KeyFilters {
  status?: 'active' | 'used' | 'revoked';
  amount?: number;
  dateRange?: { start: Date; end: Date };
}

// 分页选项
export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: 'created_at' | 'amount' | 'expires_at';
  sortOrder?: 'asc' | 'desc';
}

// 分页结果
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

// 批量操作结果
export interface BatchOperationResult {
  success: number;
  failed: number;
  errors?: string[];
}

// 批量创建结果
export interface BatchCreateResult extends BatchOperationResult {
  keys?: RechargeKey[];
}

// 统计信息
export interface KeyStatistics {
  total: number;
  active: number;
  used: number;
  revoked: number;
  expired: number;
  totalAmount: number;
  usedAmount: number;
}

/**
 * 密钥管理服务类
 */
class KeyManagementService {
  /**
   * 创建单个密钥
   */
  createKey(params: CreateKeyParams): RechargeKey {
    const keyString = this.generateRandomKey();
    
    const result = db.prepare(`
      INSERT INTO recharge_keys (key_string, amount, status, created_at, updated_at, notes) 
      VALUES (?, ?, 'active', datetime('now'), datetime('now'), ?)
    `).run(
      keyString,
      params.amount,
      params.notes || null
    );
    
    return this.getKeyById(result.lastInsertRowid as number)!;
  }

  /**
   * 通过ID获取密钥
   */
  getKeyById(id: number): RechargeKey | null {
    const key = db.prepare('SELECT * FROM recharge_keys WHERE id = ?').get(id) as RechargeKey | undefined;
    return key || null;
  }

  /**
   * 通过密钥字符串获取密钥
   */
  getKeyByKeyString(keyString: string): RechargeKey | null {
    const key = db.prepare('SELECT * FROM recharge_keys WHERE key_string = ?').get(keyString) as RechargeKey | undefined;
    return key || null;
  }

  /**
   * 更新密钥状态
   */
  updateKeyStatus(id: number, status: 'active' | 'revoked'): boolean {
    const result = db.prepare(`
      UPDATE recharge_keys 
      SET status = ?, updated_at = datetime('now') 
      WHERE id = ? AND status != 'used'
    `).run(status, id);
    
    return result.changes > 0;
  }

  /**
   * 删除密钥
   */
  deleteKey(id: number): boolean {
    const result = db.prepare('DELETE FROM recharge_keys WHERE id = ? AND status != \'used\'').run(id);
    return result.changes > 0;
  }

  /**
   * 分页查询密钥
   */
  getKeys(filters: KeyFilters = {}, pagination: PaginationOptions): PaginatedResult<RechargeKey> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    // 构建查询条件
    if (filters.status) {
      whereClause += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.amount) {
      whereClause += ' AND amount = ?';
      params.push(filters.amount);
    }

    if (filters.dateRange) {
      whereClause += ' AND created_at BETWEEN ? AND ?';
      params.push(filters.dateRange.start.toISOString(), filters.dateRange.end.toISOString());
    }



    // 构建排序
    const sortBy = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';
    const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;

    // 计算总数
    const countQuery = `SELECT COUNT(*) as total FROM recharge_keys ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as { total: number };
    const total = countResult.total;

    // 分页查询
    const offset = (pagination.page - 1) * pagination.pageSize;
    const dataQuery = `
      SELECT * FROM recharge_keys 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `;
    const data = db.prepare(dataQuery).all(...params, pagination.pageSize, offset) as RechargeKey[];

    return {
      data,
      pagination: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize)
      }
    };
  }

  /**
   * 搜索密钥
   */
  searchKeys(keyword: string, pagination: PaginationOptions): PaginatedResult<RechargeKey> {
    const whereClause = 'WHERE (key_string LIKE ? OR notes LIKE ?)';
    const searchTerm = `%${keyword}%`;
    const params = [searchTerm, searchTerm];

    // 构建排序
    const sortBy = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';
    const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;

    // 计算总数
    const countQuery = `SELECT COUNT(*) as total FROM recharge_keys ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as { total: number };
    const total = countResult.total;

    // 分页查询
    const offset = (pagination.page - 1) * pagination.pageSize;
    const dataQuery = `
      SELECT * FROM recharge_keys 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `;
    const data = db.prepare(dataQuery).all(...params, pagination.pageSize, offset) as RechargeKey[];

    return {
      data,
      pagination: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize)
      }
    };
  }

  /**
   * 批量创建密钥
   */
  batchCreateKeys(params: BatchCreateParams): BatchCreateResult {
    if (params.count <= 0 || params.count > 50) {
      return {
        success: 0,
        failed: params.count,
        errors: ['批量创建数量必须在1-50之间']
      };
    }

    const keys: RechargeKey[] = [];
    const errors: string[] = [];
    let successCount = 0;

    try {
      db.prepare('BEGIN').run();

      for (let i = 0; i < params.count; i++) {
        try {
          const key = this.createKey({
            amount: params.amount,
            notes: params.notes
          });
          keys.push(key);
          successCount++;
        } catch (error) {
          errors.push(`第${i + 1}个密钥创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      }

      db.prepare('COMMIT').run();
    } catch (error) {
      db.prepare('ROLLBACK').run();
      return {
        success: 0,
        failed: params.count,
        errors: ['批量创建事务失败: ' + (error instanceof Error ? error.message : '未知错误')]
      };
    }

    return {
      success: successCount,
      failed: params.count - successCount,
      keys,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 批量删除密钥
   */
  batchDeleteKeys(ids: number[]): BatchOperationResult {
    if (ids.length === 0 || ids.length > 50) {
      return {
        success: 0,
        failed: ids.length,
        errors: ['批量删除数量必须在1-50之间']
      };
    }

    const errors: string[] = [];
    let successCount = 0;

    try {
      db.prepare('BEGIN').run();

      for (const id of ids) {
        try {
          const success = this.deleteKey(id);
          if (success) {
            successCount++;
          } else {
            errors.push(`密钥ID ${id} 删除失败（可能不存在或已被使用）`);
          }
        } catch (error) {
          errors.push(`密钥ID ${id} 删除错误: ${error instanceof Error ? error.message : '未知错误'}`);
        }
      }

      db.prepare('COMMIT').run();
    } catch (error) {
      db.prepare('ROLLBACK').run();
      return {
        success: 0,
        failed: ids.length,
        errors: ['批量删除事务失败: ' + (error instanceof Error ? error.message : '未知错误')]
      };
    }

    return {
      success: successCount,
      failed: ids.length - successCount,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * 获取密钥统计信息
   */
  getKeyStatistics(): KeyStatistics {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) as used,
        SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revoked,
        SUM(CASE WHEN expires_at IS NOT NULL AND expires_at < datetime('now') THEN 1 ELSE 0 END) as expired,
        SUM(amount) as totalAmount,
        SUM(CASE WHEN status = 'used' THEN amount ELSE 0 END) as usedAmount
      FROM recharge_keys
    `).get() as KeyStatistics;

    return stats;
  }

  /**
   * 生成随机密钥字符串
   */
  private generateRandomKey(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// 导出单例实例
export const keyManagementService = new KeyManagementService();
export default keyManagementService;
