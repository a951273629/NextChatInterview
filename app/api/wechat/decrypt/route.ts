import { NextRequest, NextResponse } from "next/server";
import crypto from 'crypto';

// WXBizDataCrypt解密类
class WXBizDataCrypt {
  private appId: string;
  private sessionKey: string;

  constructor(appId: string, sessionKey: string) {
    this.appId = appId;
    this.sessionKey = sessionKey;
  }

  decryptData(encryptedData: string, iv: string) {
    try {
      // base64 decode
      const sessionKey = Buffer.from(this.sessionKey, 'base64');
      const encryptedDataBuffer = Buffer.from(encryptedData, 'base64');
      const ivBuffer = Buffer.from(iv, 'base64');

      // 解密
      const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey as any, ivBuffer as any);
      // 设置自动 padding 为 true，删除填充补位
      decipher.setAutoPadding(true);
      let decoded = decipher.update(encryptedDataBuffer as any, 'binary', 'utf8');
      decoded += decipher.final('utf8');
      
      const decryptedData = JSON.parse(decoded);

      if (decryptedData.watermark.appid !== this.appId) {
        throw new Error('Illegal Buffer');
      }

      return decryptedData;
    } catch (err) {
      throw new Error('Illegal Buffer');
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sessionKey, encryptedData, iv } = await req.json();

    if (!sessionKey || !encryptedData || !iv) {
      return NextResponse.json(
        { success: false, message: '参数缺失' },
        { status: 400 }
      );
    }

    // 从环境变量获取小程序配置
    const appId = process.env.WECHAT_APPID;

    if (!appId) {
      return NextResponse.json(
        { success: false, message: '小程序配置缺失' },
        { status: 500 }
      );
    }

    // 解密数据
    const wxCrypt = new WXBizDataCrypt(appId, sessionKey);
    const decryptedData = wxCrypt.decryptData(encryptedData, iv);

    return NextResponse.json({
      success: true,
      data: decryptedData,
      message: '解密成功'
    });

  } catch (error) {
    console.error('解密失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : '解密失败' 
      },
      { status: 500 }
    );
  }
} 