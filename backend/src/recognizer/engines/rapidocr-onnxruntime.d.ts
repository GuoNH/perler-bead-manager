/**
 * RapidOCR 是可选的第三方依赖（OCR_ENGINE=rapidocr 时才需要安装）。
 * 这里给动态 import 提供最小类型声明，避免未安装时类型检查报错。
 */
declare module "rapidocr-onnxruntime" {
  export function ocr(imagePath: string): Promise<unknown>;
}
