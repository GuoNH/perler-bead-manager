import type {
  LegendItem,
  RecognizeResult,
  Warning,
} from "@pinpin/shared";
import { medianRgb } from "./color.js";
import { decodeRgb } from "./decode.js";
import { detectSwatches } from "./legend.js";
import { ocrCrop } from "./ocr.js";
import { parseLegendText, type LegendParse } from "./parse.js";
import { planTextRegions, type OcrRegion } from "./pairing.js";

function sampleColor(img: { rgb: Uint8Array; width: number }, box: {
  x0: number; y0: number; x1: number; y1: number;
}): LegendItem["rgb"] {
  const inset = 3;
  return medianRgb(img.rgb, img.width, {
    x0: Math.min(box.x0 + inset, box.x1 - 1),
    y0: Math.min(box.y0 + inset, box.y1 - 1),
    x1: Math.max(box.x0 + inset + 1, box.x1 - inset),
    y1: Math.max(box.y0 + inset + 1, box.y1 - inset),
  });
}

/** 每个待 OCR 区域的结果 */
interface RegionRead {
  region: OcrRegion;
  text: string;
  /** 该区域词级置信度的平均值；0 表示引擎未提供 */
  confidence: number;
  parse: LegendParse | null;
}

function isId(v: string | null): v is string {
  return !!v && v.length > 0;
}

function isCount(v: number | null): v is number {
  return v !== null && Number.isInteger(v) && v >= 0;
}

/** 一个解析结果的完整度打分：编号字母+数字 > 纯字母 > 纯数字，带数量加分。 */
function parseScore(parse: LegendParse | null): number {
  if (!parse) return 0;
  let s = 0;
  if (parse.id) {
    if (/^[A-Z]+\d+$/.test(parse.id)) s += 60;
    else if (/^[A-Z]+$/.test(parse.id)) s += 40;
    else s += 20; // 纯数字编号（OCR 丢字母前缀）
  }
  if (isCount(parse.count)) s += 30;
  return s;
}

/**
 * 合并同一色块多个区域（整块/紧致/周边）的解析结果：
 * 优先完整度最高的；若它缺数量，用其它区域的合法数量补上。
 */
export function mergeRegionReads(reads: RegionRead[]): {
  id: string | null;
  count: number | null;
  confidence: number;
} | null {
  const valid = reads.filter((r) => r.parse);
  if (valid.length === 0) return null;

  let best = valid[0];
  let bestScore = -1;
  for (const r of valid) {
    const sc = parseScore(r.parse) + r.confidence / 1000;
    if (sc > bestScore) {
      bestScore = sc;
      best = r;
    }
  }

  let id = best.parse!.id ?? null;
  let count = best.parse!.count ?? null;
  let confidence = best.confidence;

  if (!isCount(count)) {
    for (const r of valid) {
      if (isCount(r.parse!.count)) {
        count = r.parse!.count;
        break;
      }
    }
  }
  if (!isId(id)) {
    // 编号缺失时不用“纯数量”冒充编号。
    id = null;
  }
  return { id, count, confidence };
}

const MIN_CONFIDENCE = 45; // 低于此置信度给 warn（仍保留，由人工确认）

export async function recognize(
  imageName: string,
  input: Buffer,
): Promise<RecognizeResult> {
  const img = await decodeRgb(input);
  const swatches = detectSwatches(img);
  const regions = planTextRegions(img, swatches);
  const warnings: Warning[] = [];
  const legend: LegendItem[] = [];

  for (let i = 0; i < swatches.length; i++) {
    const s = swatches[i];
    const reads: RegionRead[] = [];
    // 整块色块优先读（印在内部的文字），再用紧致/周边区域补细节。
    const ordered = [...regions[i]].sort(
      (a, b) => rankSource(a.source) - rankSource(b.source),
    );
    for (const region of ordered) {
      try {
        const res = await ocrCrop(img, region.box, {
          whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()",
          psm: region.source === "cell" ? 6 : 7,
        });
        const conf =
          res.words.length > 0
            ? res.words.reduce((acc, w) => acc + w.confidence, 0) / res.words.length
            : 0;
        reads.push({
          region,
          text: res.text,
          confidence: conf,
          parse: parseLegendText(res.text),
        });
      } catch (err) {
        warnings.push({
          level: "error",
          message: `第 ${s.row + 1} 行第 ${i + 1} 个图例 OCR 失败：${err instanceof Error ? err.message : String(err)}`,
        });
        break;
      }
    }

    const merged = mergeRegionReads(reads);
    const fail = (reason: string) =>
      warnings.push({
        level: "warn",
        message: `第 ${s.row + 1} 行第 ${i + 1} 个图例识别失败：${reason}`,
      });

    if (!merged || !isId(merged.id)) {
      fail(reads.map((r) => r.text).filter(Boolean).join(" ") || "空");
      continue;
    }

    if (merged.confidence > 0 && merged.confidence < MIN_CONFIDENCE) {
      warnings.push({
        level: "warn",
        message: `编号 ${merged.id} 的 OCR 置信度较低（${Math.round(merged.confidence)}），请人工核对`,
      });
    }
    if (!isCount(merged.count)) {
      warnings.push({
        level: "warn",
        message: `编号 ${merged.id} 的数量无法识别`,
      });
    }
    legend.push({
      id: merged.id,
      count: isCount(merged.count) ? merged.count : 0,
      rgb: sampleColor(img, s),
    });
  }

  if (legend.length === 0) {
    warnings.push({ level: "error", message: "未检测到图例条目" });
  }

  return {
    image: { name: imageName, width: img.width, height: img.height },
    legend,
    warnings,
  };
}

function rankSource(source: OcrRegion["source"]): number {
  switch (source) {
    case "cell":
      return 0;
    case "tight":
      return 1;
    case "around":
      return 2;
  }
}
