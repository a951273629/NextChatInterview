/**
 * PDF.js TypeScript 声明文件
 * 解决pdfjs-dist的类型问题
 */

declare module "pdfjs-dist" {
  export interface GlobalWorkerOptions {
    workerSrc: string;
  }

  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
    destroy(): Promise<void>;
  }

  export interface PDFPageProxy {
    getTextContent(params?: any): Promise<TextContent>;
  }

  export interface TextContent {
    items: TextItem[];
  }

  export interface TextItem {
    str: string;
    transform?: number[];
  }

  export interface DocumentInitParameters {
    data?: ArrayBuffer | Uint8Array;
    url?: string;
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
  }

  export function getDocument(
    src: DocumentInitParameters
  ): PDFDocumentLoadingTask;

  export const GlobalWorkerOptions: GlobalWorkerOptions;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  const worker: string;
  export default worker;
} 