import { execFile } from "node:child_process";
import type { EngineWord, OcrEngine, OcrOptions } from "./types.js";

const TESSERACT_EXE =
  process.env.TESSERACT_EXE ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
    : "tesseract");

/**
 * 通过子进程调用本机 tesseract，用 TSV 输出同时拿到文本、逐词置信度与包围盒。
 * TSV 不可用时回退到纯文本输出（置信度为 0、包围盒为空）。
 */
export class TesseractEngine implements OcrEngine {
  readonly name = "tesseract";

  recognize(imagePath: string, opts: OcrOptions = {}): Promise<EngineWord[]> {
    return new Promise((resolve, reject) => {
      const args = [imagePath, "stdout"];
      if (opts.whitelist) args.push("-c", `tessedit_char_whitelist=${opts.whitelist}`);
      if (opts.psm) args.push("--psm", String(opts.psm));
      args.push("tsv");
      execFile(TESSERACT_EXE, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
          const hint =
            process.platform === "win32"
              ? "请安装 Tesseract OCR 或设置 TESSERACT_EXE 环境变量"
              : "请安装 tesseract（如 brew install tesseract）或设置 TESSERACT_EXE 环境变量";
          reject(new Error(`OCR 引擎不可用（${TESSERACT_EXE}）：${hint}`));
          return;
        }
        resolve(parseTsv(stdout));
      });
    });
  }
}

/** 便捷入口：等价于 `new TesseractEngine().recognize(...)`。 */
export function runTesseract(imagePath: string, opts: OcrOptions = {}): Promise<EngineWord[]> {
  return new TesseractEngine().recognize(imagePath, opts);
}

function parseTsv(out: string): EngineWord[] {
  if (!out.includes("level\t")) {
    // 非 TSV 输出（旧版/异常），整段作为单个词返回，无坐标。
    const text = out.replace(/\s+/g, "").trim();
    return text ? [{ text, confidence: 0, x: 0, y: 0, w: 0, h: 0 }] : [];
  }
  const lines = out.split(/\r?\n/).filter((l) => l.length > 0);
  const words: EngineWord[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    const level = Number(cols[0]);
    const text = (cols[11] ?? "").trim();
    const conf = Number(cols[10]);
    if (level !== 5 || text.length === 0 || !Number.isFinite(conf) || conf < 0) continue;
    words.push({
      text,
      confidence: Math.round(conf),
      x: Number(cols[6]) || 0,
      y: Number(cols[7]) || 0,
      w: Number(cols[8]) || 0,
      h: Number(cols[9]) || 0,
    });
  }
  return words;
}
