/**
 * PDF文本提取模块
 * 使用Mozilla PDF.js (pdfjs-dist) 在浏览器环境中提取PDF文本
 */

// PDF.js 类型定义
interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
  destroy(): Promise<void>;
}

interface PDFPageProxy {
  getTextContent(): Promise<TextContent>;
}

interface TextContent {
  items: TextItem[];
}

interface TextItem {
  str: string;
  transform?: number[];
}

interface PDFSource {
  data: ArrayBuffer | Uint8Array;
}

// 进度回调函数类型
export type ProgressCallback = (progress: number) => void;

// PDF提取结果类型
export interface PDFExtractResult {
  text: string;
  numPages: number;
  success: boolean;
  error?: string;
}

/**
 * 动态导入PDF.js并配置Worker
 */
let pdfjsLib: any = null;
let isInitialized = false;

async function initializePDFJS(): Promise<void> {
  if (isInitialized && pdfjsLib) {
    return;
  }

  try {
    // 动态导入pdfjs-dist
    pdfjsLib = await import('pdfjs-dist');
    
    // 设置Worker路径 - 针对PDF.js 5.3.31版本
    if (typeof window !== 'undefined') {
      // 方案1: 使用本地public目录的worker文件
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      console.log('[PDF.js] 使用本地Worker文件: /pdf.worker.min.js (版本 5.3.31)');
      
      // 如果本地worker加载失败，可以尝试以下备用方案：
      // 方案2: 使用CDN worker (备用) - 更新到5.3.31版本
      // pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.3.31/pdf.worker.min.mjs';
      
      // 方案3: 使用node_modules中的worker (如果支持)
      // try {
      //   const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
      //   pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(pdfjsWorker, import.meta.url).toString();
      // } catch (workerImportError) {
      //   console.warn('[PDF.js] 静态导入worker失败，使用本地路径');
      //   pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      // }
    }

    isInitialized = true;
    console.log('[PDF.js] 初始化成功，版本 5.3.31');
  } catch (error) {
    console.error('[PDF.js] 初始化失败:', error);
    throw new Error('PDF.js 初始化失败');
  }
}

/**
 * 从PDF文件中提取文本
 * @param arrayBuffer PDF文件的ArrayBuffer数据
 * @param onProgress 进度回调函数，参数为0-100的进度值
 * @returns Promise<PDFExtractResult> 提取结果
 */
export async function extractTextFromPDF(
  arrayBuffer: ArrayBuffer,
  onProgress?: ProgressCallback
): Promise<PDFExtractResult> {
  try {
    // 确保PDF.js已初始化
    await initializePDFJS();

    if (!pdfjsLib) {
      throw new Error('PDF.js 未正确初始化');
    }

    // 初始进度
    onProgress?.(10);

    // 创建PDF源对象
    const pdfSource: PDFSource = {
      data: new Uint8Array(arrayBuffer)
    };

    // 加载PDF文档
    const loadingTask = pdfjsLib.getDocument(pdfSource);
    const pdfDocument: PDFDocumentProxy = await loadingTask.promise;

    onProgress?.(30);

    const numPages = pdfDocument.numPages;
    console.log(`[PDF.js] PDF文档加载成功，共 ${numPages} 页`);

    let fullText = '';
    
    // 遍历所有页面提取文本
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        // 获取页面
        const page: PDFPageProxy = await pdfDocument.getPage(pageNum);
        
        // 获取页面文本内容
        const textContent: TextContent = await page.getTextContent();
        
        // 提取文本字符串
        const pageText = textContent.items
          .map((item: TextItem) => item.str)
          .join(' ');
        
        if (pageText.trim()) {
          fullText += pageText + '\n\n';
        }

        // 更新进度
        const progress = 30 + (pageNum / numPages) * 60; // 30-90%
        onProgress?.(Math.round(progress));

        console.log(`[PDF.js] 第 ${pageNum} 页文本提取完成`);
      } catch (pageError) {
        console.warn(`[PDF.js] 第 ${pageNum} 页提取失败:`, pageError);
        // 继续处理下一页，不中断整个过程
      }
    }

    // 清理资源
    await pdfDocument.destroy();

    onProgress?.(100);

    if (!fullText.trim()) {
      throw new Error('未能从PDF中提取到任何文本内容');
    }

    console.log(`[PDF.js] 文本提取完成，总长度: ${fullText.length} 字符`);

    return {
      text: fullText.trim(),
      numPages,
      success: true
    };

  } catch (error: any) {
    console.error('[PDF.js] 文本提取失败:', error);
    
    return {
      text: '',
      numPages: 0,
      success: false,
      error: error.message || String(error)
    };
  }
}

/**
 * 检查PDF.js是否可用
 */
export function isPDFJSAvailable(): boolean {
  return typeof window !== 'undefined' && isInitialized;
}

/**
 * 预初始化PDF.js（可选，用于提前加载）
 */
export async function preInitializePDFJS(): Promise<boolean> {
  try {
    await initializePDFJS();
    return true;
  } catch (error) {
    console.error('[PDF.js] 预初始化失败:', error);
    return false;
  }
} 