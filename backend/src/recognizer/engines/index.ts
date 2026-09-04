import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { OcrEngine } from "./types.js";
import { RapidOcrEngine } from "./rapidocr.js";
import { TesseractEngine } from "./tesseract.js";
import { TesseractJsEngine } from "./tesseractjs.js";

export type { EngineWord, OcrEngine, OcrOptions } from "./types.js";
export {
  ALNUM_WHITELIST,
  DIGIT_WHITELIST,
  LEGEND_WHITELIST,
} from "./types.js";
export { runTesseract, TesseractEngine } from "./tesseract.js";
export { TesseractJsEngine } from "./tesseractjs.js";
export { RapidOcrEngine } from "./rapidocr.js";

export type OcrEngineName = "auto" | "tesseract" | "tesseractjs" | "rapidocr";

/**
 * 按 OCR_ENGINE 环境变量选择引擎；缺省 auto：
 * 系统 tesseract（TSV，快）可用则用，否则退回 tesseract.js（WASM，
 * 使用仓库内 tessdata，任何平台都能跑）。rapidocr 需自行安装依赖。
 */
export function createOcrEngine(
  engine: OcrEngineName = (process.env.OCR_ENGINE as OcrEngineName | undefined) ?? "auto",
): OcrEngine {
  const name = engine === "auto" ? pickAvailableEngine() : engine;
  switch (name) {
    case "rapidocr":
      return new RapidOcrEngine();
    case "tesseractjs":
      return new TesseractJsEngine();
    case "tesseract":
      return new TesseractEngine();
    default:
      throw new Error(
        `未知的 OCR 引擎：${name}（可选 auto / tesseract / tesseractjs / rapidocr）`,
      );
  }
}

/** 探测本机可用的引擎：优先系统 tesseract，其次 tesseract.js。 */
function pickAvailableEngine(): "tesseract" | "tesseractjs" {
  // 显式 TESSERACT_EXE 优先（用户可能把 tesseract 装到非标准路径）。
  const exe =
    process.env.TESSERACT_EXE ??
    (process.platform === "win32"
      ? "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
      : "tesseract");
  if (process.env.TESSERACT_EXE || process.platform === "win32") {
    return existsSync(exe) ? "tesseract" : "tesseractjs";
  }
  const r = spawnSync("tesseract", ["--version"], { stdio: "ignore" });
  return r.error || r.status !== 0 ? "tesseractjs" : "tesseract";
}
