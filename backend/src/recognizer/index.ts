import type {
  LegendItem,
  RecognizeResult,
  Warning,
} from "@pinpin/shared";
import { medianRgb } from "./color.js";
import { decodeRgb } from "./decode.js";
import { detectSwatches } from "./legend.js";
import { ocrCrop } from "./ocr.js";

function sampleColor(img: { rgb: Uint8Array; width: number }, box: {
  x0: number; y0: number; x1: number; y1: number;
}): LegendItem["rgb"] {
  const inset = 3;
  return medianRgb(img.rgb, img.width, {
    x0: box.x0 + inset,
    y0: box.y0 + inset,
    x1: box.x1 - inset,
    y1: box.y1 - inset,
  });
}

export async function recognize(
  imageName: string,
  input: Buffer,
): Promise<RecognizeResult> {
  const img = await decodeRgb(input);
  const swatches = detectSwatches(img);
  const warnings: Warning[] = [];
  const legend: LegendItem[] = [];

  for (let i = 0; i < swatches.length; i++) {
    const s = swatches[i];
    const prev = i > 0 && swatches[i - 1].row === s.row ? swatches[i - 1] : null;
    const left = prev ? prev.x1 : 0;
    const width = s.x0 - left;
    if (width <= 0) continue;
    const midY = Math.round((s.y0 + s.y1) / 2);
    const idBox = { x0: left, y0: s.y0, x1: s.x0, y1: midY };
    const countBox = { x0: left, y0: midY, x1: s.x0, y1: s.y1 };
    const id = await ocrCrop(img, idBox, { whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", psm: 7 });
    const countText = await ocrCrop(img, countBox, { whitelist: "0123456789", psm: 7 });
    const count = countText.trim() === "" ? NaN : Number(countText);
    if (!id) {
      warnings.push({ level: "error", message: `条目 ${i + 1} 未识别到编号` });
      continue;
    }
    if (!Number.isInteger(count) || count < 0) {
      warnings.push({ level: "warn", message: `编号 ${id} 的数量无法识别：${countText || "空"}` });
    }
    legend.push({
      id,
      count: Number.isInteger(count) && count >= 0 ? count : 0,
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
