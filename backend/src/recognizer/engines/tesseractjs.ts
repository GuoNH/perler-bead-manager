import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorker, type Worker } from "tesseract.js";
import type { EngineWord, OcrEngine, OcrOptions } from "./types.js";

/**
 * tesseract.js（WASM）引擎：不依赖系统安装 tesseract，用仓库内提交的
 * `tessdata/eng.traineddata`，在任何平台都能跑。
 *
 * 与 `TesseractEngine`（本机 tesseract 二进制）实现同一接口，作为
 * 系统 tesseract 不可用时的自动回退。取词级结果时用 blocks 输出
 * 逐词 confidence 与包围盒，行为与 TSV 引擎对齐。
 */

const OCR_LANG = "eng";
const OEM = 1; // LSTM

/** 仓库内提交的语言数据目录（本文件在 backend/src/recognizer/engines/ 下）。 */
function tessdataPath(): string {
  const fromModule = fileURLToPath(new URL("../../../../tessdata/", import.meta.url));
  const fromCwd = join(process.cwd(), "tessdata");
  // 优先相对本文件的路径；被 esbuild 打包后 import.meta.url 变化时退回 cwd。
  const hit = [fromModule, fromCwd].find((p) => existsSync(join(p, "eng.traineddata")));
  return hit ?? fromModule;
}

let workerPromise: Promise<Worker> | null = null;
let workerError: Error | null = null;

async function getWorker(): Promise<Worker> {
  if (workerError) throw workerError;
  if (!workerPromise) {
    const cachePath = join(tmpdir(), "pinpin-tesseractjs");
    workerPromise = (async () => {
      try {
        await mkdir(cachePath, { recursive: true });
        const worker = await createWorker(OCR_LANG, OEM, {
          langPath: tessdataPath(),
          gzip: false,
          cachePath,
          cacheMethod: "none",
        });
        // 图例文字只关心字母/数字/括号，白名单在每次 recognize 前再按需收紧。
        await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()" });
        return worker;
      } catch (err) {
        workerError = err instanceof Error ? err : new Error(String(err));
        throw workerError;
      }
    })();
  }
  return workerPromise;
}

export class TesseractJsEngine implements OcrEngine {
  readonly name = "tesseractjs";

  async recognize(imagePath: string, opts: OcrOptions = {}): Promise<EngineWord[]> {
    const worker = await getWorker();
    const params: Record<string, string | number> = {};
    if (opts.whitelist) params.tessedit_char_whitelist = opts.whitelist;
    if (opts.psm) params.tessedit_pageseg_mode = opts.psm;
    if (Object.keys(params).length > 0) await worker.setParameters(params);

    const { data } = await worker.recognize(imagePath, {}, { blocks: true, text: true });
    const words = extractWords(data);
    if (words.length > 0) return words;
    // blocks 输出异常时的回退：整段作为单个词，无包围盒。
    const page = data as unknown as { text?: string; confidence?: number };
    const text = (page.text ?? "").replace(/\s+/g, "").trim();
    return text
      ? [{ text, confidence: Math.round(page.confidence ?? 0), x: 0, y: 0, w: 0, h: 0 }]
      : [];
  }
}

/** 把 tesseract.js 的 blocks 结构拍平成词级结果（类型放宽以兼容引擎输出）。 */
function extractWords(data: unknown): EngineWord[] {
  const out: EngineWord[] = [];
  const blocks = (data as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return out;
  for (const block of blocks) {
    const paragraphs = (block as { paragraphs?: unknown }).paragraphs;
    if (!Array.isArray(paragraphs)) continue;
    for (const para of paragraphs) {
      const lines = (para as { lines?: unknown }).lines;
      if (!Array.isArray(lines)) continue;
      for (const line of lines) {
        const words = (line as { words?: unknown }).words;
        if (!Array.isArray(words)) continue;
        for (const w of words) {
          const word = w as {
            text?: unknown;
            confidence?: unknown;
            bbox?: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
          };
          const text = String(word.text ?? "").trim();
          if (!text) continue;
          const b = word.bbox ?? {};
          const x0 = Number(b.x0 ?? 0);
          const y0 = Number(b.y0 ?? 0);
          const x1 = Number(b.x1 ?? x0);
          const y1 = Number(b.y1 ?? y0);
          out.push({
            text,
            confidence: Math.round(Number(word.confidence ?? 0)),
            x: x0,
            y: y0,
            w: Math.max(0, x1 - x0),
            h: Math.max(0, y1 - y0),
          });
        }
      }
    }
  }
  return out;
}

/** 供测试清理缓存的 worker（vitest 进程退出前调用，避免句柄泄漏）。 */
export async function terminateTesseractJsWorker(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    if (w) await w.terminate().catch(() => {});
  }
  workerPromise = null;
  workerError = null;
}
