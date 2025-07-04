"use client";

import React, { useState, useEffect, useCallback } from 'react';
import styles from './key-management.module.scss';
import { 
  RechargeKey, 
  CreateKeyParams, 
  BatchCreateParams, 
  KeyFilters, 
  PaginationOptions, 
  PaginatedResult
} from '../../../api/wechat-user/services/key-management';

// API客户端类
class KeyManagementAPI {
  private static baseUrl = '/api/wechat-user/key-management';

  static async getKeys(filters?: KeyFilters, pagination?: PaginationOptions): Promise<PaginatedResult<RechargeKey>> {
    const params = new URLSearchParams();
    
    if (pagination) {
      params.append('page', pagination.page.toString());
      params.append('pageSize', pagination.pageSize.toString());
      if (pagination.sortBy) params.append('sortBy', pagination.sortBy);
      if (pagination.sortOrder) params.append('sortOrder', pagination.sortOrder);
    }
    
    if (filters) {
      if (filters.status) params.append('status', filters.status);
      if (filters.amount) params.append('amount', filters.amount.toString());
    //   if (filters.isExpired !== undefined) params.append('isExpired', filters.isExpired.toString());
      if (filters.dateRange) {
        params.append('startDate', filters.dateRange.start.toISOString());
        params.append('endDate', filters.dateRange.end.toISOString());
      }
    }

    const response = await fetch(`${this.baseUrl}?${params}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return { data: data.data, pagination: data.pagination };
  }

  static async searchKeys(keyword: string, pagination?: PaginationOptions): Promise<PaginatedResult<RechargeKey>> {
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



  static async createKey(params: CreateKeyParams): Promise<RechargeKey> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }

  static async batchCreateKeys(params: BatchCreateParams): Promise<any> {
    const response = await fetch(`${this.baseUrl}?action=batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }

  static async updateKeyStatus(id: number, status: 'active' | 'revoked'): Promise<void> {
    const response = await fetch(`${this.baseUrl}?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
  }

  static async deleteKey(id: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}?id=${id}`, {
      method: 'DELETE'
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
  }

  static async batchDeleteKeys(ids: number[]): Promise<any> {
    const response = await fetch(`${this.baseUrl}?action=batch`, {
      method: 'DELETE',
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

// 密钥表格组件
interface KeysTableProps {
  keys: RechargeKey[];
  loading: boolean;
  selectedKeys: number[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSelectKey: (id: number) => void;
  onSelectAll: (selected: boolean) => void;
  onSort: (field: string) => void;
  onUpdateStatus: (id: number, status: 'active' | 'revoked') => void;
  onDelete: (id: number) => void;
}

const KeysTable: React.FC<KeysTableProps> = ({
  keys,
  loading,
  selectedKeys,
  sortBy,
  sortOrder,
  onSelectKey,
  onSelectAll,
  onSort,
  onUpdateStatus,
  onDelete
}) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return '--';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatKey = (keyString: string) => {
    return keyString.substring(0, 8) + '****' + keyString.substring(keyString.length - 4);
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        加载中...
      </div>
    );
  }

  if (keys.length === 0) {
         return (
       <div className={styles.emptyState}>
         <div className={styles.emptyStateIcon}>📝</div>
         <div className={styles.emptyStateText}>暂无密钥数据</div>
         <div className={styles.emptyStateSubtext}>点击&ldquo;创建密钥&rdquo;按钮开始创建</div>
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
                checked={selectedKeys.length === keys.length && keys.length > 0}
                onChange={(e) => onSelectAll(e.target.checked)}
              />
            </th>
            <th 
              className={`${styles.headerCell} ${styles.sortable} ${sortBy === 'id' ? `${styles.sorted} ${styles[sortOrder]}` : ''}`}
              onClick={() => onSort('id')}
            >
              ID
            </th>
            <th className={styles.headerCell}>密钥</th>
            <th 
              className={`${styles.headerCell} ${styles.sortable} ${sortBy === 'amount' ? `${styles.sorted} ${styles[sortOrder]}` : ''}`}
              onClick={() => onSort('amount')}
            >
              金额
            </th>
            <th className={styles.headerCell}>状态</th>
            <th 
              className={`${styles.headerCell} ${styles.sortable} ${sortBy === 'created_at' ? `${styles.sorted} ${styles[sortOrder]}` : ''}`}
              onClick={() => onSort('created_at')}
            >
              创建时间
            </th>
            <th className={styles.headerCell}>备注</th>
            <th className={styles.headerCell}>操作</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr 
              key={key.id} 
              className={`${styles.tableRow} ${selectedKeys.includes(key.id!) ? styles.selected : ''}`}
            >
              <td className={styles.tableCell}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedKeys.includes(key.id!)}
                  onChange={() => onSelectKey(key.id!)}
                />
              </td>
              <td className={styles.tableCell}>{key.id}</td>
              <td className={styles.tableCell}>
                <span className={styles.keyString}>{formatKey(key.key_string)}</span>
              </td>
              <td className={styles.tableCell}>¥{key.amount}</td>
              <td className={styles.tableCell}>
                <span className={`${styles.statusBadge} ${styles[key.status]}`}>
                  {key.status === 'active' ? '活跃' : key.status === 'used' ? '已使用' : '已撤销'}
                </span>
              </td>
              <td className={styles.tableCell}>{formatDate(key.created_at?.toString())}</td>
              <td className={styles.tableCell}>{key.notes || '--'}</td>
              <td className={styles.tableCell}>
                <div className={styles.actionCell}>
                  {key.status === 'active' && (
                    <button
                      className={`${styles.actionButtonSmall} ${styles.edit}`}
                      onClick={() => onUpdateStatus(key.id!, 'revoked')}
                    >
                      撤销
                    </button>
                  )}
                  {key.status === 'revoked' && (
                    <button
                      className={`${styles.actionButtonSmall} ${styles.edit}`}
                      onClick={() => onUpdateStatus(key.id!, 'active')}
                    >
                      激活
                    </button>
                  )}
                  {key.status !== 'used' && (
                    <button
                      className={`${styles.actionButtonSmall} ${styles.delete}`}
                      onClick={() => onDelete(key.id!)}
                    >
                      删除
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// 创建密钥模态框
interface CreateKeyModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (params: CreateKeyParams) => void;
  loading: boolean;
}

const CreateKeyModal: React.FC<CreateKeyModalProps> = ({ show, onClose, onSubmit, loading }) => {
  const [formData, setFormData] = useState<CreateKeyParams>({
    amount: 10,
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleReset = () => {
    setFormData({
      amount: 10,
      notes: ''
    });
  };

  if (!show) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>创建密钥</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.modalContent}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>金额 *</label>
              <input
                type="number"
                className={styles.formInput}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                min="1"
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>备注</label>
              <textarea
                className={`${styles.formInput} ${styles.formTextarea}`}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="可选的备注信息"
              />
            </div>
          </div>
          
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.secondary}`}
              onClick={handleReset}
            >
              重置
            </button>
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
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 批量创建模态框
interface BatchCreateModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (params: BatchCreateParams) => void;
  loading: boolean;
}

const BatchCreateModal: React.FC<BatchCreateModalProps> = ({ show, onClose, onSubmit, loading }) => {
  const [formData, setFormData] = useState<BatchCreateParams>({
    count: 10,
    amount: 10,
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (!show) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>批量创建密钥</h3>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className={styles.modalContent}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>创建数量 * (最多50个)</label>
              <input
                type="number"
                className={styles.formInput}
                value={formData.count}
                onChange={(e) => setFormData({ ...formData, count: Number(e.target.value) })}
                min="1"
                max="50"
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>单个金额 *</label>
              <input
                type="number"
                className={styles.formInput}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                min="1"
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>备注</label>
              <textarea
                className={`${styles.formInput} ${styles.formTextarea}`}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="统一的备注信息"
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
              {loading ? '创建中...' : `创建 ${formData.count} 个密钥`}
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
          <p>确定要删除选中的 {count} 个密钥吗？</p>
          <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '8px' }}>
            注意：已使用的密钥无法删除，此操作不可撤销。
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
export const KeyManagement: React.FC = () => {
  // 状态管理
  const [keys, setKeys] = useState<RechargeKey[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  
  // 分页和过滤状态
  const [pagination, setPagination] = useState<PaginationOptions>({
    page: 1,
    pageSize: 10,
    sortBy: 'created_at',
    sortOrder: 'desc'
  });
  
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  
  const [filters, setFilters] = useState<KeyFilters>({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // 模态框状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchCreateModal, setShowBatchCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  
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
        result = await KeyManagementAPI.searchKeys(searchKeyword, pagination);
      } else {
        result = await KeyManagementAPI.getKeys(filters, pagination);
      }
      
      setKeys(result.data);
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
   const handleSelectKey = (id: number) => {
     setSelectedKeys((prev: number[]) => 
       prev.includes(id) 
         ? prev.filter(keyId => keyId !== id)
         : [...prev, id]
     );
   };

  const handleSelectAll = (selected: boolean) => {
    setSelectedKeys(selected ? keys.map(key => key.id!).filter(id => keys.find(k => k.id === id)?.status !== 'used') : []);
  };

  // 创建密钥
  const handleCreateKey = async (params: CreateKeyParams) => {
    setCreateLoading(true);
    try {
      await KeyManagementAPI.createKey(params);
      setShowCreateModal(false);
      showToast('密钥创建成功', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '创建失败', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  // 批量创建密钥
  const handleBatchCreateKeys = async (params: BatchCreateParams) => {
    setCreateLoading(true);
    try {
      const result = await KeyManagementAPI.batchCreateKeys(params);
      setShowBatchCreateModal(false);
      showToast(`成功创建 ${result.success} 个密钥`, 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '批量创建失败', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  // 更新密钥状态
  const handleUpdateStatus = async (id: number, status: 'active' | 'revoked') => {
    try {
      await KeyManagementAPI.updateKeyStatus(id, status);
      showToast(`密钥已${status === 'active' ? '激活' : '撤销'}`, 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  // 删除密钥
  const handleDeleteKey = async (id: number) => {
    try {
      await KeyManagementAPI.deleteKey(id);
      showToast('密钥删除成功', 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  // 批量删除密钥
  const handleBatchDelete = async () => {
    setCreateLoading(true);
    try {
      const result = await KeyManagementAPI.batchDeleteKeys(selectedKeys);
      setShowDeleteModal(false);
      setSelectedKeys([]);
      showToast(`成功删除 ${result.success} 个密钥`, 'success');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '批量删除失败', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  // 导出选中密钥
  const handleExportKeys = () => {
    const selectedKeysData = keys.filter(key => selectedKeys.includes(key.id!));
    const content = generateExportContent(selectedKeysData);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `keys_export_${timestamp}.txt`;
    downloadTextFile(content, filename);
    showToast(`成功导出 ${selectedKeysData.length} 个密钥`, 'success');
  };

  // 生成导出内容
  const generateExportContent = (keysToExport: RechargeKey[]): string => {
    return keysToExport.map(key => {
      const keyString = key.key_string;
      const amount = key.amount;
      const createdAt = key.created_at ? 
        new Date(key.created_at).toISOString().replace('T', ' ').slice(0, 10) : 
        '--';
      return `秘钥: ${keyString} 金额: ${amount} 创建时间: ${createdAt}`;
    }).join('\n');
  };

  // 下载文本文件
  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* <h1 className={styles.pageTitle}>密钥管理系统</h1> */}
        
        {/* 统计区域 */}
        {/* <div className={styles.statisticsSection}>
          <StatisticsCards statistics={statistics} loading={false} />
        </div> */}
        
        {/* 工具栏 */}
        <div className={styles.toolbar}>
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionButton} ${styles.primary}`}
              onClick={() => setShowCreateModal(true)}
            >
              创建密钥
            </button>
            <button
              className={`${styles.actionButton} ${styles.primary}`}
              onClick={() => setShowBatchCreateModal(true)}
            >
              批量创建
            </button>
            <button
              className={`${styles.actionButton} ${styles.secondary}`}
              onClick={handleExportKeys}
              disabled={selectedKeys.length === 0}
            >
              导出选中 ({selectedKeys.length})
            </button>
            <button
              className={`${styles.actionButton} ${styles.danger}`}
              onClick={() => setShowDeleteModal(true)}
              disabled={selectedKeys.length === 0}
            >
              批量删除 ({selectedKeys.length})
            </button>
          </div>
          
          <div className={styles.searchSection}>
            <input
              type="text"
              className={styles.searchBox}
              placeholder="搜索密钥或备注..."
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
              <label className={styles.filterLabel}>状态</label>
              <select
                className={styles.filterSelect}
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any || undefined })}
              >
                <option value="">全部状态</option>
                <option value="active">活跃</option>
                <option value="used">已使用</option>
                <option value="revoked">已撤销</option>
              </select>
            </div>
            
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>金额</label>
              <input
                type="number"
                className={styles.filterInput}
                placeholder="筛选金额"
                value={filters.amount || ''}
                onChange={(e) => setFilters({ ...filters, amount: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          </div>
        )}
        
        {/* 错误提示 */}
        {error && (
          <div className={styles.errorContainer}>
            {error}
          </div>
        )}
        
        {/* 数据表格 */}
        <KeysTable
          keys={keys}
          loading={loading}
          selectedKeys={selectedKeys}
          sortBy={pagination.sortBy || 'created_at'}
          sortOrder={pagination.sortOrder || 'desc'}
          onSelectKey={handleSelectKey}
          onSelectAll={handleSelectAll}
          onSort={handleSort}
          onUpdateStatus={handleUpdateStatus}
          onDelete={handleDeleteKey}
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
        <CreateKeyModal
          show={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateKey}
          loading={createLoading}
        />
        
        <BatchCreateModal
          show={showBatchCreateModal}
          onClose={() => setShowBatchCreateModal(false)}
          onSubmit={handleBatchCreateKeys}
          loading={createLoading}
        />
        
        <DeleteConfirmModal
          show={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleBatchDelete}
          count={selectedKeys.length}
          loading={createLoading}
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

// export  KeyManagement;
