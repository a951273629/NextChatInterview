import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get("session");
    
    if (session && session.value === "authenticated") {
      return NextResponse.json({
        authenticated: true,
        message: "已认证"
      });
    }
    
    return NextResponse.json(
      { authenticated: false, message: "未认证" },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { authenticated: false, message: "服务器错误" },
      { status: 500 }
    );
  }
} 