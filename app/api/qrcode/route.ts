import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('text');
    const sizeParam = searchParams.get('size');

    // 验证参数
    if (!text) {
      return NextResponse.json(
        { error: 'Text parameter is required' },
        { status: 400 }
      );
    }

    // 解析size参数，默认为150
    let size = 150;
    if (sizeParam) {
      const parsedSize = parseInt(sizeParam, 10);
      if (isNaN(parsedSize) || parsedSize < 50 || parsedSize > 1000) {
        return NextResponse.json(
          { error: 'Size must be a number between 50 and 1000' },
          { status: 400 }
        );
      }
      size = parsedSize;
    }

    // 使用简单的方式生成QR码 - 调用第三方API
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
    
    // 获取QR码图片
    const response = await fetch(qrApiUrl);
    
    if (!response.ok) {
      throw new Error('Failed to generate QR code');
    }

    const imageBuffer = await response.arrayBuffer();

    // 返回图片流
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // 缓存1小时
      },
    });

  } catch (error) {
    console.error('QR Code generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, size = 150 } = body;

    // 验证参数
    if (!text) {
      return NextResponse.json(
        { error: 'Text parameter is required' },
        { status: 400 }
      );
    }

    if (typeof size !== 'number' || size < 50 || size > 1000) {
      return NextResponse.json(
        { error: 'Size must be a number between 50 and 1000' },
        { status: 400 }
      );
    }

    // 使用第三方API生成QR码
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
    
    const response = await fetch(qrApiUrl);
    
    if (!response.ok) {
      throw new Error('Failed to generate QR code');
    }

    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error) {
    console.error('QR Code generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
} 