import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";
import {
  ALNUM_WHITELIST,
  createOcrEngine,
  type EngineWord,
  type OcrEngine,
  type OcrOptions,
} from "./engines/index.js";

/**
 * 图像预处理 + OCR 引擎的“友好封装”。
 *
 * 真正调用引擎（tesseract / rapidocr …）的逻辑在 engines/ 下，本模块只负责：
 * 1. 把原始图像的一个矩形区域裁剪出来；
 * 2. 灰度放大 + Otsu 二值化，自动判断“浅底深字 / 深底浅字”极性；
 * 3. 交给当前 OCR 引擎识别，返回整段文本与逐词结果。
 *
 * 上层（recognizer/index.ts）只依赖这里导出的 `ocrCrop`，因此替换引擎时
 * 上层代码与单测都不需要改。
 */

export type { EngineWord, OcrEngine, OcrOptions } from "./engines/index.js";
export { ALNUM_WHITELIST, LEGEND_WHITELIST } from "./engines/index.js";

export interface OcrCropResult {
  /** 按阅读顺序拼接的词文本（词间以空格分隔） */
  text: string;
  /** 引擎返回的逐词结果（含置信度） */
  words: EngineWord[];
}

let defaultEngine: OcrEngine | null = null;
function engine(): OcrEngine {
  // 惰性创建，方便单测通过 OCR_ENGINE 注入假引擎。
  defaultEngine ??= createOcrEngine();
  return defaultEngine;
}

/** 仅供测试替换引擎。 */
export function setOcrEngineForTests(e: OcrEngine | null): void {
  defaultEngine = e;
}

/**
 * 识别 crop 区域内的文字。返回逐词结果与整段文本。
 *
 * @param opts.psm 缺省 7（单行）；识别整块图例文字可用 psm 6。
 */
export async function ocrCrop(
  img: DecodedImage,
  box: Box,
  opts: OcrOptions = {},
): Promise<OcrCropResult> {
  const dir = await mkdtemp(join(tmpdir(), "pinpin-ocr-"));
  try {
    const file = await prepareCrop(img, box, dir, opts);
    const words = await engine().recognize(file, {
      psm: opts.psm ?? 7,
      whitelist: opts.whitelist ?? ALNUM_WHITELIST,
    });
    const ordered = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
    const text = ordered
      .map((w) => w.text.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    return { text, words: ordered };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 只取整段文本的便捷方法。 */
export async function ocrText(
  img: DecodedImage,
  box: Box,
  opts: OcrOptions = {},
): Promise<string> {
  return (await ocrCrop(img, box, opts)).text;
}

async function prepareCrop(
  img: DecodedImage,
  box: Box,
  dir: string,
  opts: OcrOptions,
): Promise<string> {
  const raw = Buffer.from(img.rgb);
  const src = {
    raw: { width: img.width, height: img.height, channels: 3 as const },
  };
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(img.width, Math.ceil(box.x1));
  const y1 = Math.min(img.height, Math.ceil(box.y1));
  const cropW = Math.max(1, x1 - x0);
  const cropH = Math.max(1, y1 - y0);

  // 加一点内边距，避免笔画贴着裁剪边。
  const pad = Math.max(2, Math.round(cropH * 0.12));
  const ex = {
    left: Math.max(0, x0 - pad),
    top: Math.max(0, y0 - pad),
    width: Math.min(img.width - Math.max(0, x0 - pad), cropW + pad * 2),
    height: Math.min(img.height - Math.max(0, y0 - pad), cropH + pad * 2),
  };

  // 文字太小是 tesseract 准确率低的主因：按高度放大到至少 64px。
  const targetH = Math.max(64, Math.round(cropH * 4));
  const scale = targetH / ex.height;
  const targetW = Math.max(8, Math.round(ex.width * scale));

  const { data, info } = await sharp(raw, src)
    .extract(ex)
    .greyscale()
    .resize(Math.max(1, targetW), Math.max(1, targetH), { kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const gray = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const polarity = opts.polarity ?? guessPolarity(gray);
  const threshold = otsuThreshold(gray);
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    out[i] = polarity === "dark" ? (v < threshold ? 0 : 255) : v > threshold ? 0 : 255;
  }

  const png = await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .png()
    .toBuffer();
  const file = join(dir, "crop.png");
  await writeFile(file, png);
  return file;
}

/** 根据灰阶直方图判断墨迹极性：浅底深字 -> dark，深底浅字 -> light。 */
function guessPolarity(gray: Uint8Array): "dark" | "light" {
  const total = gray.length;
  let dark = 0;
  let light = 0;
  for (let i = 0; i < total; i++) {
    const v = gray[i];
    if (v < 110) dark++;
    else if (v > 205) light++;
  }
  const fDark = dark / total;
  const fLight = light / total;
  const inRange = (f: number) => f >= 0.002 && f <= 0.55;
  if (inRange(fDark) && inRange(fLight)) return fDark <= fLight ? "dark" : "light";
  if (inRange(fDark)) return "dark";
  if (inRange(fLight)) return "light";
  return "dark";
}

/** 大津法二值化阈值；退化时返回 128。 */
function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}
