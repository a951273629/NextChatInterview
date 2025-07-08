import db from '@/app/db';

// 用户接口
export interface User {
  id?: number;
  openid: string;
  nickname?: string | null;
  avatar_url?: string | null;
  balance: number;
  status: string;
  is_activated: boolean;
  activated_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

// 用户过滤器
export interface UserFilters {
  status?: 'active' | 'inactive' | 'banned';
  is_activated?: boolean;
  balanceRange?: { min: number; max: number };
  dateRange?: { start: Date; end: Date };
}

// 分页选项
export interface PaginationOptions {
  page: number;
  pageSize: number;
  sortBy?: 'created_at' | 'balance' | 'nickname' | 'updated_at';
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

// 用户统计信息
export interface UserStatistics {
  total: number;
  active: number;
  inactive: number;
  banned: number;
  activated: number;
  totalBalance: number;
  averageBalance: number;
}

// 批量操作结果
export interface BatchOperationResult {
  success: number;
  failed: number;
  errors?: string[];
}

/**
 * 用户服务类 - 处理用户相关操作
 */
class UserService {
  /**
   * 通过openid获取用户信息，不存在则自动创建
   */
  getUserByOpenId(openid: string): User {
    // 查询是否存在用户
    let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid) as User | undefined;
    
    if (!user) {
      // 新用户注册，赠送50点初始余额
      const result = db.prepare(
        'INSERT INTO users (openid, balance, status, is_activated, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
      ).run(openid, 50, 'active', 0);
      
      user = this.getUserById(result.lastInsertRowid as number);
      console.log(`已创建新用户，openid: ${openid}, id: ${user.id}，赠送50点余额`);
    }
    
    return user;
  }

  /**
   * 通过ID获取用户
   */
  getUserById(id: number): User {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * 分页查询用户
   */
  getUsers(filters: UserFilters = {}, pagination: PaginationOptions): PaginatedResult<User> {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    // 构建查询条件
    if (filters.status) {
      whereClause += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.is_activated !== undefined) {
      whereClause += ' AND is_activated = ?';
      params.push(filters.is_activated ? 1 : 0);
    }

    if (filters.balanceRange) {
      whereClause += ' AND balance BETWEEN ? AND ?';
      params.push(filters.balanceRange.min, filters.balanceRange.max);
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
    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as { total: number };
    const total = countResult.total;

    // 分页查询
    const offset = (pagination.page - 1) * pagination.pageSize;
    const dataQuery = `
      SELECT * FROM users 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `;
    const data = db.prepare(dataQuery).all(...params, pagination.pageSize, offset) as User[];

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
   * 搜索用户
   */
  searchUsers(keyword: string, pagination: PaginationOptions): PaginatedResult<User> {
    const whereClause = 'WHERE (nickname LIKE ? OR openid LIKE ?)';
    const searchTerm = `%${keyword}%`;
    const params = [searchTerm, searchTerm];

    // 构建排序
    const sortBy = pagination.sortBy || 'created_at';
    const sortOrder = pagination.sortOrder || 'desc';
    const orderClause = `ORDER BY ${sortBy} ${sortOrder}`;

    // 计算总数
    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const countResult = db.prepare(countQuery).get(...params) as { total: number };
    const total = countResult.total;

    // 分页查询
    const offset = (pagination.page - 1) * pagination.pageSize;
    const dataQuery = `
      SELECT * FROM users 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `;
    const data = db.prepare(dataQuery).all(...params, pagination.pageSize, offset) as User[];

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
   * 更新用户信息
   */
  updateUser(user: Partial<User> & { id: number }): User {
    // 获取当前用户数据
    const currentUser = this.getUserById(user.id);
    
    // 更新用户信息
    db.prepare(`
      UPDATE users 
      SET 
        nickname = ?, 
        avatar_url = ?, 
        balance = ?, 
        status = ?, 
        is_activated = ?, 
        activated_at = ?, 
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      user.nickname ?? currentUser.nickname, 
      user.avatar_url ?? currentUser.avatar_url, 
      user.balance ?? currentUser.balance, 
      user.status ?? currentUser.status, 
      user.is_activated !== undefined ? (user.is_activated ? 1 : 0) : (currentUser.is_activated ? 1 : 0), 
      user.activated_at ? user.activated_at.toISOString() : currentUser.activated_at, 
      user.id
    );
    
    return this.getUserById(user.id);
  }

  /**
   * 更新用户余额
   */
  updateUserBalance(userId: number, balance: number): User {
    return this.updateUser({
      id: userId,
      balance: balance
    });
  }

  /**
   * 激活用户
   */
  activateUser(userId: number): User {
    return this.updateUser({
      id: userId,
      is_activated: true,
      activated_at: new Date()
    });
  }

  /**
   * 停用激活状态
   */
  deactivateUser(userId: number): User {
    return this.updateUser({
      id: userId,
      is_activated: false
    });
  }

  /**
   * 更新用户资料（昵称和头像）
   */
  updateUserProfile(userId: number, nickname?: string, avatarUrl?: string): User {
    return this.updateUser({
      id: userId,
      nickname: nickname,
      avatar_url: avatarUrl
    });
  }

  /**
   * 删除用户
   */
  deleteUser(id: number): boolean {
    try {
      db.prepare('BEGIN').run();
      
      // 删除相关记录
      db.prepare('DELETE FROM consumption_records WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM recharge_records WHERE user_id = ?').run(id);
      
      // 删除用户
      const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
      
      db.prepare('COMMIT').run();
      return result.changes > 0;
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  }

  /**
   * 批量删除用户
   */
  batchDeleteUsers(ids: number[]): BatchOperationResult {
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
          const success = this.deleteUser(id);
          if (success) {
            successCount++;
          } else {
            errors.push(`用户ID ${id} 删除失败（可能不存在）`);
          }
        } catch (error) {
          errors.push(`用户ID ${id} 删除错误: ${error instanceof Error ? error.message : '未知错误'}`);
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
   * 获取用户统计信息
   */
  getUserStatistics(): UserStatistics {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) as banned,
        SUM(CASE WHEN is_activated = 1 THEN 1 ELSE 0 END) as activated,
        SUM(balance) as totalBalance,
        AVG(balance) as averageBalance
      FROM users
    `).get() as UserStatistics;

    return stats;
  }


}

// 导出单例实例
export const userService = new UserService();
export default userService; 