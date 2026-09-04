import type { OcrEngine } from "./types.js";
import { RapidOcrEngine } from "./rapidocr.js";
import { TesseractEngine } from "./tesseract.js";

export type { EngineWord, OcrEngine, OcrOptions } from "./types.js";
export {
  ALNUM_WHITELIST,
  DIGIT_WHITELIST,
  LEGEND_WHITELIST,
} from "./types.js";
export { runTesseract, TesseractEngine } from "./tesseract.js";
export { RapidOcrEngine } from "./rapidocr.js";

/** 按 OCR_ENGINE 环境变量选择引擎；默认 tesseract。 */
export function createOcrEngine(engine = process.env.OCR_ENGINE ?? "tesseract"): OcrEngine {
  switch (engine) {
    case "rapidocr":
      return new RapidOcrEngine();
    case "tesseract":
      return new TesseractEngine();
    default:
      throw new Error(`未知的 OCR 引擎：${engine}（可选 tesseract / rapidocr）`);
  }
}
