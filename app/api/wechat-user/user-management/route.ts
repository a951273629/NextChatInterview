import { NextRequest, NextResponse } from "next/server";
import { 
  userService,
  User,
  UserFilters,
  PaginationOptions,
  UserStatistics
} from "../services/userService";

/**
 * 获取用户列表 (分页、过滤、搜索)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    // 分页参数
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const sortBy = searchParams.get('sortBy') as 'created_at' | 'balance' | 'nickname' | 'updated_at' || 'created_at';
    const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' || 'desc';
    
    const pagination: PaginationOptions = {
      page,
      pageSize,
      sortBy,
      sortOrder
    };
    
    // 搜索关键词
    const search = searchParams.get('search');
    
    if (search && search.trim()) {
      // 执行搜索
      const result = await userService.searchUsers(search.trim(), pagination);
      return NextResponse.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    }
    
    // 过滤参数
    const filters: UserFilters = {};
    
    const status = searchParams.get('status');
    if (status) {
      filters.status = status as 'active' | 'inactive' | 'banned';
    }
    
    const isActivated = searchParams.get('isActivated');
    if (isActivated !== null) {
      filters.is_activated = isActivated === 'true';
    }
    
    const minBalance = searchParams.get('minBalance');
    const maxBalance = searchParams.get('maxBalance');
    if (minBalance && maxBalance) {
      filters.balanceRange = {
        min: parseInt(minBalance),
        max: parseInt(maxBalance)
      };
    }
    
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (startDate && endDate) {
      filters.dateRange = {
        start: new Date(startDate),
        end: new Date(endDate)
      };
    }
    
    // 获取统计信息（可选）
    const includeStats = searchParams.get('includeStats') === 'true';
    let statistics: UserStatistics | undefined;
    
    if (includeStats) {
      statistics = userService.getUserStatistics();
    }
    
    // 执行查询
    const result = userService.getUsers(filters, pagination);
    
    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      statistics,
    });
    
  } catch (error) {
    console.error("获取用户列表失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      },
      { status: 500 }
    );
  }
}

/**
 * 批量删除用户
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    
    if (action === 'batch-delete') {
      // 批量删除用户
      const { ids } = await req.json();
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json(
          { success: false, error: "请提供要删除的用户ID列表" },
          { status: 400 }
        );
      }
      
      const result = userService.batchDeleteUsers(ids);
      
      return NextResponse.json({
        success: true,
        data: result,
        message: `成功删除 ${result.success} 个用户`,
      });
    }
    
    return NextResponse.json(
      { success: false, error: "不支持的操作" },
      { status: 400 }
    );
    
  } catch (error) {
    console.error("批量删除用户失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      },
      { status: 500 }
    );
  }
}

/**
 * 更新用户信息
 */
export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: "缺少用户ID参数" },
        { status: 400 }
      );
    }
    
    const userData = await req.json();
    const userId = parseInt(id);
    
    // 验证用户是否存在
    try {
      userService.getUserById(userId);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: "用户不存在" },
        { status: 404 }
      );
    }
    
    // 更新用户
    const updatedUser = userService.updateUser({
      id: userId,
      ...userData,
      activated_at: userData.activated_at ? new Date(userData.activated_at) : undefined,
    });
    
    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: "用户信息更新成功",
    });
    
  } catch (error) {
    console.error("更新用户失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      },
      { status: 500 }
    );
  }
}

/**
 * 删除用户
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: "缺少用户ID参数" },
        { status: 400 }
      );
    }
    
    const userId = parseInt(id);
    
    // 验证用户是否存在
    try {
      userService.getUserById(userId);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: "用户不存在" },
        { status: 404 }
      );
    }
    
    // 删除用户
    const success = userService.deleteUser(userId);
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: "用户删除成功",
      });
    } else {
      return NextResponse.json(
        { success: false, error: "删除失败" },
        { status: 500 }
      );
    }
    
  } catch (error) {
    console.error("删除用户失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "服务器错误",
      },
      { status: 500 }
    );
  }
} 