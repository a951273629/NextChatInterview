import { NextRequest, NextResponse } from 'next/server';
import keyManagementService, { 
  CreateKeyParams, 
  BatchCreateParams, 
  KeyFilters, 
  PaginationOptions 
} from '../services/key-management';

// API响应接口
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}



// 参数验证工具
function validatePaginationParams(searchParams: URLSearchParams): PaginationOptions {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '10')));
  const sortBy = ['created_at', 'amount', 'expires_at'].includes(searchParams.get('sortBy') || '') 
    ? searchParams.get('sortBy') as 'created_at' | 'amount' | 'expires_at'
    : 'created_at';
  const sortOrder = ['asc', 'desc'].includes(searchParams.get('sortOrder') || '') 
    ? searchParams.get('sortOrder') as 'asc' | 'desc'
    : 'desc';

  return { page, pageSize, sortBy, sortOrder };
}

function validateFilters(searchParams: URLSearchParams): KeyFilters {
  const filters: KeyFilters = {};

  const status = searchParams.get('status');
  if (status && ['active', 'used', 'revoked'].includes(status)) {
    filters.status = status as 'active' | 'used' | 'revoked';
  }

  const amount = searchParams.get('amount');
  if (amount && !isNaN(Number(amount))) {
    filters.amount = Number(amount);
  }

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  if (startDate && endDate) {
    filters.dateRange = {
      start: new Date(startDate),
      end: new Date(endDate)
    };
  }

//   const isExpired = searchParams.get('isExpired');
//   if (isExpired === 'true' || isExpired === 'false') {
//     filters.isExpired = isExpired === 'true';
//   }

  return filters;
}

// GET - 查询密钥列表或搜索
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    
    // 处理统计信息请求
    if (searchParams.get('action') === 'stats') {
      const stats = keyManagementService.getKeyStatistics();
      return NextResponse.json<ApiResponse>({
        success: true,
        data: stats
      });
    }

    // 处理搜索请求
    const keyword = searchParams.get('search');
    const pagination = validatePaginationParams(searchParams);

    if (keyword) {
      const result = keyManagementService.searchKeys(keyword, pagination);
      return NextResponse.json<ApiResponse>({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    }

    // 处理常规查询
    const filters = validateFilters(searchParams);
    const result = keyManagementService.getKeys(filters, pagination);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('查询密钥失败:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 });
  }
}

// POST - 创建密钥或批量创建
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { searchParams } = new URL(req.url);

    // 处理批量创建
    if (searchParams.get('action') === 'batch') {
      const { count, amount, notes } = body as BatchCreateParams;

      // 参数验证
      if (!count || !amount || count <= 0 || amount <= 0) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: '参数错误：count和amount必须为正数'
        }, { status: 400 });
      }

      if (count > 50) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: '批量创建数量不能超过50个'
        }, { status: 400 });
      }

      const result = keyManagementService.batchCreateKeys({
        count,
        amount,
        // expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        notes
      });

      return NextResponse.json<ApiResponse>({
        success: result.success > 0,
        data: result,
        message: `成功创建 ${result.success} 个密钥，失败 ${result.failed} 个`
      });
    }

    // 处理单个创建
    const { amount, notes } = body as CreateKeyParams;

    // 参数验证
    if (!amount || amount <= 0) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '参数错误：amount必须为正数'
      }, { status: 400 });
    }

    const key = keyManagementService.createKey({
      amount,
    //   expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      notes
    });

    return NextResponse.json<ApiResponse>({
      success: true,
      data: key,
      message: '密钥创建成功'
    });

  } catch (error) {
    console.error('创建密钥失败:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 });
  }
}

// PUT - 更新密钥状态
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id || isNaN(Number(id))) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '无效的密钥ID'
      }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body;

    if (!status || !['active', 'revoked'].includes(status)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '无效的状态值，仅支持 active 或 revoked'
      }, { status: 400 });
    }

    const success = keyManagementService.updateKeyStatus(Number(id), status);

    if (!success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '更新失败，密钥可能不存在或已被使用'
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      message: '密钥状态更新成功'
    });

  } catch (error) {
    console.error('更新密钥失败:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 });
  }
}

// DELETE - 删除密钥或批量删除
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    // 处理批量删除
    if (searchParams.get('action') === 'batch') {
      const body = await req.json();
      const { ids } = body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: '参数错误：ids必须为非空数组'
        }, { status: 400 });
      }

      if (ids.some(id => isNaN(Number(id)))) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: '参数错误：ids数组包含无效的ID'
        }, { status: 400 });
      }

      const result = keyManagementService.batchDeleteKeys(ids.map(Number));

      return NextResponse.json<ApiResponse>({
        success: result.success > 0,
        data: result,
        message: `成功删除 ${result.success} 个密钥，失败 ${result.failed} 个`
      });
    }

    // 处理单个删除
    const id = searchParams.get('id');
    
    if (!id || isNaN(Number(id))) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '无效的密钥ID'
      }, { status: 400 });
    }

    const success = keyManagementService.deleteKey(Number(id));

    if (!success) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: '删除失败，密钥可能不存在或已被使用'
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      message: '密钥删除成功'
    });

  } catch (error) {
    console.error('删除密钥失败:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 });
  }
}
