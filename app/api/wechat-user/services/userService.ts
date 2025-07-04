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
}

// 导出单例实例
export const userService = new UserService();
export default userService; 