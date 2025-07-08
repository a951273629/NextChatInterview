"use client";

import React, { useState, useEffect, useCallback } from 'react';
import styles from './user-management.module.scss';
import { 
  User,
  UserFilters,
  PaginationOptions,
  PaginatedResult,
  UserStatistics
} from '../../../api/wechat-user/services/userService';

// API客户端类
class UserManagementAPI {
  private static baseUrl = '/api/wechat-user/user-management';

  static async getUsers(filters?: UserFilters, pagination?: PaginationOptions, includeStats?: boolean): Promise<PaginatedResult<User> & { statistics?: UserStatistics }> {
    const params = new URLSearchParams();
    
    if (pagination) {
      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (pagination.sortBy) params.append('sortBy', pagination.sortBy);
      if (pagination.sortOrder) params.append('sortOrder', pagination.sortOrder);
    }
    
    if (filters) {
      if (filters.status) params.append('status', filters.status);
      if (filters.is_activated !== undefined) params.append('isActivated', filters.is_activated.toString());
      if (filters.balanceRange) {
        params.append('minBalance', filters.balanceRange.min.toString());
        params.append('maxBalance', filters.balanceRange.max.toString());
      }
      if (filters.dateRange) {
        params.append('startDate', filters.dateRange.start.toISOString());
        params.append('endDate', filters.dateRange.end.toISOString());
      }
    }

    if (includeStats) {
      params.append('includeStats', 'true');
    }

    const response = await fetch(`${this.baseUrl}?${params}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return { data: data.data, pagination: data.pagination, statistics: data.statistics };
  }

  static async searchUsers(keyword: string, pagination?: PaginationOptions): Promise<PaginatedResult<User>> {
    const params = new URLSearchParams();
    params.append('search', keyword);
    
    if (pagination) {
      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (pagination.sortBy) params.append('sortBy', pagination.sortBy);
      if (pagination.sortOrder) params.append('sortOrder', pagination.sortOrder);
    }

    const response = await fetch(`${this.baseUrl}?${params}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return { data: data.data, pagination: data.pagination };
  }



  static async updateUser(id: number, userData: Partial<User>): Promise<User> {
    const response = await fetch(`${this.baseUrl}?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }

  static async deleteUser(id: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}?id=${id}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
  }

  static async batchDeleteUsers(ids: number[]): Promise<any> {
    const response = await fetch(`${this.baseUrl}?action=batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }
}

// Toast通知组件
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`${styles.toast} ${styles[type]}`}>
      {message}
    </div>
  );
};

// 分页组件
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ 
  currentPage, 
  totalPages, 
  pageSize, 
  total, 
  onPageChange 
}) => {
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      const half = Math.floor(maxVisible / 2);
      let start = Math.max(1, currentPage - half);
      let end = Math.min(totalPages, start + maxVisible - 1);
      
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  return (
    <div className={styles.paginationContainer}>
      <div className={styles.paginationInfo}>
        显示 {startItem}-{endItem} 条，共 {total} 条
      </div>
      <div className={styles.pagination}>
        <button
          className={styles.paginationButton}
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          上一页
        </button>
        
        {getPageNumbers().map(page => (
          <button
            key={page}
            className={`${styles.paginationButton} ${page === currentPage ? styles.active : ''}`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}
        
        <button
          className={styles.paginationButton}
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
};

// 用户表格组件
interface UsersTableProps {
  users: User[];
  loading: boolean;
  selectedUsers: number[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSelectUser: (id: number) => void;
  onSelectAll: (selected: boolean) => void;
  onSort: (field: string) => void;
  onUpdateUser: (id: number, userData: Partial<User>) => void;
  onDelete: (id: number) => void;
}

const UsersTable: React.FC<UsersTableProps> = ({
  users,
  loading,
  selectedUsers,
  sortBy,
  sortOrder,
  onSelectUser,
  onSelectAll,
  onSort,
  onUpdateUser,
  onDelete
}) => {
  const formatDate = (dateString?: string | Date) => {
    if (!dateString) return '--';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatOpenId = (openid: string) => {
    if (openid.length > 12) {
      return openid.substring(0, 6) + '****' + openid.substring(openid.length - 6);
    }
    return openid;
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        加载中...
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>👥</div>
        <div className={styles.emptyStateText}>暂无用户数据</div>
        <div className={styles.emptyStateSubtext}>用户注册后会自动显示在这里</div>
      </div>
    );
  }

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead className={styles.tableHeader}>
          <tr>
            <th className={styles.headerCell}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selectedUsers.length === users.length && users.length > 0}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
            <th 
              className={`${styles.headerCell} ${styles.sortable} ${sortBy === 'id' ? `${styles.sorted} ${styles[sortOrder]}` : ''}`}
              onClick={() => onSort('id')}
            >
              ID
            </th>
            <th className={styles.headerCell}>用户信息</th>
            <th 
              className={`${styles.headerCell} ${styles.sortable} ${sortBy === 'balance' ? `${styles.sorted} ${styles[sortOrder]}` : ''}`}
              onClick={() => onSort('balance')}
            >
              余额
            </th>
            <th className={styles.headerCell}>状态</th>
            <th className={styles.headerCell}>激活状态</th>
            <th 
              className={`${styles.headerCell} ${styles.sortable} ${sortBy === 'created_at' ? `${styles.sorted} ${styles[sortOrder]}` : ''}`}
              onClick={() => onSort('created_at')}
            >
              注册时间
            </th>
            <th className={styles.headerCell}>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr 
              key={user.id} 
              className={`${styles.tableRow} ${selectedUsers.includes(user.id!) ? styles.selected : ''}`}
            >
              <td className={styles.tableCell}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedUsers.includes(user.id!)}
                  onChange={() => onSelectUser(user.id!)}
                />
              </td>
              <td className={styles.tableCell}>{user.id}</td>
              <td className={styles.tableCell}>
                <div className={styles.userInfo}>
                  {user.avatar_url && (
                    <img 
                      src={user.avatar_url} 
                      alt="头像" 
                      className={styles.avatar}
                    />
                  )}
                  <div className={styles.userDetails}>
                    <div className={styles.nickname}>
                      {user.nickname || '未设置昵称'}
                    </div>
                    <div className={styles.openid}>
                      {formatOpenId(user.openid)}
                    </div>
                  </div>
                </div>
              </td>
              <td className={styles.tableCell}>
                <span className={styles.balance}>¥{user.balance}</span>
              </td>
              <td className={styles.tableCell}>
                <span className={`${styles.statusBadge} ${styles[user.status]}`}>
                  {user.status === 'active' ? '正常' : user.status === 'inactive' ? '停用' : '封禁'}
                </span>
              </td>
              <td className={styles.tableCell}>
                <span className={`${styles.activatedBadge} ${styles[user.is_activated.toString()]}`}>
                  {user.is_activated ? '已激活' : '未激活'}
                </span>
              </td>
              <td className={styles.tableCell}>{formatDate(user.created_at)}</td>
              <td className={styles.tableCell}>
                <div className={styles.actionCell}>
                  <button
                    className={`${styles.actionButtonSmall} ${styles.edit}`}
                    onClick={() => onUpdateUser(user.id!, { balance: user.balance })}
                  >
                    编辑余额
                  </button>
                  {user.is_activated ? (
                    <button
                      className={`${styles.actionButtonSmall} ${styles.deactivate}`}
                      onClick={() => onUpdateUser(user.id!, { is_activated: false })}
                    >
                      停用激活
                    </button>
                  ) : (
                    <button
                      className={`${styles.actionButtonSmall} ${styles.activate}`}
                      onClick={() => onUpdateUser(user.id!, { is_activated: true, activated_at: new Date() })}
                    >
                      激活
                    </button>
                  )}
                  <button
                    className={`${styles.actionButtonSmall} ${styles.delete}`}
                    onClick={() => onDelete(user.id!)}
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// 编辑余额模态框
interface EditBalanceModalProps {
  show: boolean;
  user: User | null;
  onClose: () => void;
  onSubmit: (userId: number, balance: number) => void;
  loading: boolean;
}

const EditBalanceModal: React.FC<EditBalanceModalProps> = ({ 
  show, 
  user, 
  onClose, 
  onSubmit, 
  loading 
}) => {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (user) {
      setBalance(user.balance);
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user) {
      onSubmit(user.id!, balance);
    }
  };

  if (!show || !user) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>编辑用户余额</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.modalContent}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>用户信息</label>
              <div className={styles.userInfo}>
                {user.avatar_url && (
                  <img 
                    src={user.avatar_url} 
                    alt="头像" 
                    className={styles.avatar}
                  />
                )}
                <div className={styles.userDetails}>
                  <div className={styles.nickname}>
                    {user.nickname || '未设置昵称'}
                  </div>
                  <div className={styles.openid}>
                    {user.openid}
                  </div>
                </div>
              </div>
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>当前余额：¥{user.balance}</label>
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>新余额 *</label>
              <input
                type="number"
                className={styles.formInput}
                value={balance}
                onChange={(e) => setBalance(Number(e.target.value))}
                min="0"
                required
              />
            </div>
          </div>
          
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondary}`}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className={`${styles.actionButton} ${styles.primary}`}
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 删除确认模态框
interface DeleteConfirmModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
  loading: boolean;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ 
  show, 
  onClose, 
  onConfirm, 
  count, 
  loading 
}) => {
  if (!show) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>确认删除</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <div className={styles.modalContent}>
          <p>确定要删除选中的 {count} 个用户吗？</p>
          <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '8px' }}>
            注意：删除用户将同时删除其相关的充值和消费记录，此操作不可撤销。
          </p>
        </div>
        
        <div className={styles.modalFooter}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.secondary}`}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.danger}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 主组件
export const UserManagement: React.FC = () => {
  // 状态管理
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  
  // 分页和过滤状态
  const [pagination, setPagination] = useState<PaginationOptions>({
    page: 1,
    pageSize: 10,
    sortBy: 'created_at',
    sortOrder: 'desc'
  });
  
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  
  const [filters, setFilters] = useState<UserFilters>({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // 模态框状态
  const [showEditBalanceModal, setShowEditBalanceModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  // 统计信息
  const [statistics, setStatistics] = useState<UserStatistics | null>(null);
  
  // Toast状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 显示Toast
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  }, []);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      let result;
      if (searchKeyword.trim()) {
        result = await UserManagementAPI.searchUsers(searchKeyword, pagination);
      } else {
        result = await UserManagementAPI.getUsers(filters, pagination, true);
        if (result.statistics) {
          setStatistics(result.statistics);
        }
      }
      
      setUsers(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotal(result.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination, searchKeyword]);

  // 初始化数据
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 处理分页
  const handlePageChange = (page: number) => {
    setPagination((prev: PaginationOptions) => ({ ...prev, page }));
  };

  // 处理排序
  const handleSort = (field: string) => {
    setPagination((prev: PaginationOptions) => ({
      ...prev,
      sortBy: field as any,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'asc' ? 'desc' : 'asc'
    }));
  };

  // 处理搜索
  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword);
    setPagination((prev: PaginationOptions) => ({ ...prev, page: 1 }));
  };

  // 处理选择
  const handleSelectUser = (id: number) => {
    setSelectedUsers((prev: number[]) => 
      prev.includes(id) 
        ? prev.filter(userId => userId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedUsers(selected ? users.map(user => user.id!) : []);
  };

  // 更新用户信息
  const handleUpdateUser = async (id: number, userData: Partial<User>) => {
    // 如果是编辑余额，显示模态框
    if ('balance' in userData && Object.keys(userData).length === 1) {
      const user = users.find(u => u.id === id);
      if (user) {
        setEditingUser(user);
        setShowEditBalanceModal(true);
      }
      return;
    }

    try {
      await UserManagementAPI.updateUser(id, userData);
      showToast('用户信息更新成功', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '更新失败', 'error');
    }
  };

  // 编辑余额
  const handleEditBalance = async (userId: number, balance: number) => {
    setActionLoading(true);
    try {
      await UserManagementAPI.updateUser(userId, { balance });
      setShowEditBalanceModal(false);
      setEditingUser(null);
      showToast('余额更新成功', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '余额更新失败', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 删除用户
  const handleDeleteUser = async (id: number) => {
    try {
      await UserManagementAPI.deleteUser(id);
      showToast('用户删除成功', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  // 批量删除用户
  const handleBatchDelete = async () => {
    setActionLoading(true);
    try {
      const result = await UserManagementAPI.batchDeleteUsers(selectedUsers);
      setShowDeleteModal(false);
      setSelectedUsers([]);
      showToast(`成功删除 ${result.success} 个用户`, 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '批量删除失败', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* 工具栏 */}
        <div className={styles.toolbar}>
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionButton} ${styles.danger}`}
              onClick={() => setShowDeleteModal(true)}
              disabled={selectedUsers.length === 0}
            >
              批量删除 ({selectedUsers.length})
            </button>
          </div>
          
          <div className={styles.searchSection}>
            <input
              type="text"
              className={styles.searchBox}
              placeholder="搜索用户昵称或OpenID..."
              value={searchKeyword}
              onChange={(e) => handleSearch(e.target.value)}
            />
            <button
              className={`${styles.filterToggle} ${showFilters ? styles.active : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              🔍
            </button>
          </div>
        </div>
        
        {/* 高级过滤器 */}
        {showFilters && (
          <div className={styles.filterPanel}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>用户状态</label>
              <select
                className={styles.filterSelect}
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any || undefined })}
              >
                <option value="">全部状态</option>
                <option value="active">正常</option>
                <option value="inactive">停用</option>
                <option value="banned">封禁</option>
              </select>
            </div>
            
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>激活状态</label>
              <select
                className={styles.filterSelect}
                value={filters.is_activated !== undefined ? filters.is_activated.toString() : ''}
                onChange={(e) => setFilters({ 
                  ...filters, 
                  is_activated: e.target.value === '' ? undefined : e.target.value === 'true' 
                })}
              >
                <option value="">全部</option>
                <option value="true">已激活</option>
                <option value="false">未激活</option>
              </select>
            </div>
          </div>
        )}
        
        {/* 统计信息 */}
        {statistics && (
          <div style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
            <p style={{ margin: 0, color: '#6b7280' }}>
              总用户数: <strong>{statistics.total}</strong> | 
              正常: <strong style={{ color: '#059669' }}>{statistics.active}</strong> | 
              已激活: <strong style={{ color: '#059669' }}>{statistics.activated}</strong> | 
              总余额: <strong style={{ color: '#059669' }}>¥{statistics.totalBalance}</strong>
            </p>
          </div>
        )}
        
        {/* 错误提示 */}
        {error && (
          <div className={styles.errorContainer}>
            {error}
          </div>
        )}
        
        {/* 数据表格 */}
        <UsersTable
          users={users}
          loading={loading}
          selectedUsers={selectedUsers}
          sortBy={pagination.sortBy || 'created_at'}
          sortOrder={pagination.sortOrder || 'desc'}
          onSelectUser={handleSelectUser}
          onSelectAll={handleSelectAll}
          onSort={handleSort}
          onUpdateUser={handleUpdateUser}
          onDelete={handleDeleteUser}
        />
        
        {/* 分页 */}
        {total > 0 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={totalPages}
            pageSize={pagination.pageSize}
            total={total}
            onPageChange={handlePageChange}
          />
        )}
        
        {/* 模态框 */}
        <EditBalanceModal
          show={showEditBalanceModal}
          user={editingUser}
          onClose={() => {
            setShowEditBalanceModal(false);
            setEditingUser(null);
          }}
          onSubmit={handleEditBalance}
          loading={actionLoading}
        />
        
        <DeleteConfirmModal
          show={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleBatchDelete}
          count={selectedUsers.length}
          loading={actionLoading}
        />
        
        {/* Toast通知 */}
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </div>
  );
};
