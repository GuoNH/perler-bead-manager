import type { EngineWord, OcrEngine, OcrOptions } from "./types.js";

/**
 * RapidOCR（onnxruntime）引擎占位实现。
 *
 * 目的：为替换 tesseract 铺路——`OCR_ENGINE=rapidocr` 时无需改任何上层代码。
 * RapidOCR 不是仓库依赖，首次使用需安装并准备模型：
 *
 *   npm i -w backend rapidocr-onnxruntime onnxruntime-node
 *   # 并设置 RAPIDOCR_MODEL_DIR 指向包含 detection/recognition 模型的目录
 *
 * 未安装时给出明确报错，而不是静默失败。
 */
export class RapidOcrEngine implements OcrEngine {
  readonly name = "rapidocr";

  async recognize(imagePath: string, _opts: OcrOptions = {}): Promise<EngineWord[]> {
    const mod = await importRapidOcr();
    // RapidOCR 返回 [[text, confidence, 四点框], ...]，这里转成 EngineWord。
    const raw = await mod.ocr(imagePath);
    const result = (raw ?? []) as Array<
      [text: string, confidence: number, points: number[][]]
    >;
    const words: EngineWord[] = [];
    for (const [text, confidence, points] of result) {
      if (!text) continue;
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const w = Math.max(...xs) - x;
      const h = Math.max(...ys) - y;
      words.push({ text, confidence, x, y, w, h });
    }
    return words;
  }
}

async function importRapidOcr(): Promise<{ ocr: (p: string) => Promise<unknown> }> {
  try {
    return await import("rapidocr-onnxruntime");
  } catch {
    throw new Error(
      "OCR_ENGINE=rapidocr 需要安装依赖：npm i -w backend rapidocr-onnxruntime onnxruntime-node，并设置 RAPIDOCR_MODEL_DIR",
    );
  }
}
