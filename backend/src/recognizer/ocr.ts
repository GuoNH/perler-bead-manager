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
 * 真正调用引擎（tesseract / tesseract.js / rapidocr …）的逻辑在 engines/ 下，
 * 本模块只负责：
 * 1. 把原始图像的一个矩形区域裁剪出来（可选 `inset`：往内收，避开色块边框）；
 * 2. 放大 + 可选 Otsu 二值化；`binarize: false` 时保留灰度图（对“彩色底上
 *    印白字/黑字”的小号图例文字通常更稳）；
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

/** ocrCrop 的预处理选项：在引擎 OcrOptions 基础上增加裁剪/二值化开关。 */
export interface OcrCropOptions extends OcrOptions {
  /** 从裁剪框四周往内收的像素数（>0 时用于“整块色块内印刷文字”，避开边框/锯齿） */
  inset?: number;
  /** 是否先做 Otsu 二值化；false 输出灰度图。缺省 true（保持旧行为）。 */
  binarize?: boolean;
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
  opts: OcrCropOptions = {},
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
  opts: OcrCropOptions = {},
): Promise<string> {
  return (await ocrCrop(img, box, opts)).text;
}

async function prepareCrop(
  img: DecodedImage,
  box: Box,
  dir: string,
  opts: OcrCropOptions,
): Promise<string> {
  const raw = Buffer.from(img.rgb);
  const src = {
    raw: { width: img.width, height: img.height, channels: 3 as const },
  };
  const inset = Math.max(0, Math.floor(opts.inset ?? 0));
  const x0 = Math.max(0, Math.floor(box.x0) + inset);
  const y0 = Math.max(0, Math.floor(box.y0) + inset);
  const x1 = Math.min(img.width, Math.ceil(box.x1) - inset);
  const y1 = Math.min(img.height, Math.ceil(box.y1) - inset);
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
  let out: Uint8Array;
  if (opts.binarize === false) {
    // 直接输出灰度：彩色底上的深字/浅字都保留原始对比，交给引擎判断。
    out = gray;
  } else {
    const polarity = opts.polarity ?? guessPolarity(gray);
    const threshold = otsuThreshold(gray);
    out = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) {
      const v = gray[i];
      out[i] =
        polarity === "dark" ? (v < threshold ? 0 : 255) : v > threshold ? 0 : 255;
    }
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

/**
 * 根据“背景色”判断墨迹极性：先取整块里占比最高的灰阶作为背景；
 * 背景明显偏浅（>160）说明印的是深字（dark），明显偏深（<96）说明印的是
 * 浅字（light）。仅当背景灰度居中时，才退回旧的深/浅像素占比推断。
 */
function guessPolarity(gray: Uint8Array): "dark" | "light" {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  let bg = 0;
  let bgCount = 0;
  for (let t = 0; t < 256; t++) {
    if (hist[t] > bgCount) {
      bgCount = hist[t];
      bg = t;
    }
  }
  if (bgCount > 0 && (bg < 96 || bg > 160)) {
    // 背景明显偏深 -> 浅字；明显偏浅 -> 深字。
    return bg >= 160 ? "dark" : "light";
  }

  // 背景居中（如中灰底 + 深字）：退回按深/浅像素占比推断。
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
