import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";
import type { Swatch } from "./legend.js";
import { detectTextWords, type TextWord } from "./text.js";

/**
 * “布局无关”的图例文字配对。
 *
 * 图例里“编号/数量”相对色块的位置不固定：可能印在色块内部（深底白字 /
 * 浅底深字），也可能印在色块左侧、右侧、上方或下方的留白里。这里不猜布局，
 * 而是：
 *
 * 1. 对每个色块行，在色块周边一个窗口里找“深色文字”（浅色背景上的墨迹），
 *    也在每个色块内部找“少数派极值墨迹”（色块内印刷的文字）。
 * 2. 用“色块间中点半区”把周边文字水平归属给最近的色块（左侧/右侧/上下
 *    标签都能命中自己所属的色块）；垂直上优先归属最近的行带，防止行间的
 *    标签被相邻行重复认领。
 * 3. 同属一个色块、同一文字行的文字词合并成一个 OCR 区域（例如印在色块
 *    上方的一整行 `A10(202)` 不会被拆成单字逐个识别）。
 * 4. 每个色块始终把“整块色块”作为第一个候选（覆盖文字印在色块内部、
 *    且墨迹对比度低、难以单独聚类的图纸），再用紧致/周边区域补细节。
 */

export interface OcrRegion {
  box: Box;
  /** 区域来源：cell=整块色块；tight=色块内文字紧致包围盒；around=色块旁/上下的文字 */
  source: "cell" | "tight" | "around";
  /** 文字极性（tight/around 区域才有意义） */
  ink?: "dark" | "light";
}

/** 一个文字候选：bbox + 墨迹极性 */
interface Word {
  box: Box;
  ink: "dark" | "light";
}

const ROW_VPAD_FRAC = 0.55; // 周边窗口在垂直方向额外扩出的比例（按行高）
const ROW_HPAD_FRAC = 1.6; // 周边窗口在水平方向额外扩出的比例（按行高）
const MIN_HPAD = 28;

/**
 * 计算每个色块应该拿去 OCR 的区域。
 *
 * @returns 与 swatches 等长的数组；每个元素是该色块的候选区域（按阅读顺序）。
 */
export function planTextRegions(img: DecodedImage, swatches: Swatch[]): OcrRegion[][] {
  const rows = groupRows(swatches);
  const result: OcrRegion[][] = swatches.map(() => []);

  const rowBands = rows.map(({ swatches: s }) => {
    const top = Math.min(...s.map((x) => x.y0));
    const bottom = Math.max(...s.map((x) => x.y1));
    return { swatches: s, top, bottom, height: bottom - top };
  });

  // 1) 收集每行周边的深色文字，暂不归属（垂直上可能属于相邻行）。
  const allAround: Array<{ word: Word; row: number }> = [];
  for (let ri = 0; ri < rowBands.length; ri++) {
    const band = rowBands[ri];
    const vPad = Math.max(6, Math.round(band.height * ROW_VPAD_FRAC));
    const hPad = Math.max(MIN_HPAD, Math.round(band.height * ROW_HPAD_FRAC));
    const first = band.swatches[0];
    const last = band.swatches[band.swatches.length - 1];
    const region: Box = {
      x0: Math.max(0, first.x0 - hPad),
      y0: Math.max(0, band.top - vPad),
      x1: Math.min(img.width, last.x1 + hPad),
      y1: Math.min(img.height, band.bottom + vPad),
    };
    for (const w of detectTextWords(img, region)) {
      if (!overlapsAnySwatch(w, band.swatches)) {
        allAround.push({ word: { box: w, ink: w.ink }, row: ri });
      }
    }
  }

  // 2) 垂直归属到最近行带，再按“色块间中点半区”水平归属到具体色块。
  const used = new Set<Word>();
  const aroundBySwatch: Word[][] = swatches.map(() => []);
  for (const item of allAround) {
    const cy = (item.word.box.y0 + item.word.box.y1) / 2;
    let bestRi = item.row;
    let bestD = Infinity;
    for (let ri = 0; ri < rowBands.length; ri++) {
      const b = rowBands[ri];
      const d = cy < b.top ? b.top - cy : cy > b.bottom ? cy - b.bottom : 0;
      if (d < bestD) {
        bestD = d;
        bestRi = ri;
      }
    }
    const band = rowBands[bestRi];
    const owner = assignByHalfSpan(band.swatches, item.word.box);
    if (owner >= 0) {
      const idx = swatches.indexOf(band.swatches[owner]);
      if (idx >= 0 && !used.has(item.word)) {
        used.add(item.word);
        aroundBySwatch[idx].push(item.word);
      }
    }
  }

  // 3) 同一色块、同一文字行的周边文字合成一个区域（避免把 A10(202)
  //    拆成单字碎片后逐个 OCR）。
  for (let i = 0; i < aroundBySwatch.length; i++) {
    for (const line of groupTextLines(aroundBySwatch[i])) {
      result[i].push({
        box: unionBox(line.map((w) => w.box)),
        source: "around",
        ink: majorityInk(line),
      });
    }
  }

  // 4) 色块内部文字：整块色块总是作为第一个候选（覆盖“文字印在色块内部”），
  //    内部文字按行合成紧致框作为候选（可恢复整块 OCR 丢失的前缀/括号）。
  for (let i = 0; i < swatches.length; i++) {
    const s = swatches[i];
    result[i].unshift({ box: s, source: "cell" });
    const insideWords: Word[] = detectTextWords(img, s, { inside: true }).map((w) => ({
      box: w,
      ink: w.ink,
    }));
    for (const line of groupTextLines(insideWords)) {
      result[i].push({
        box: unionBox(line.map((w) => w.box)),
        source: "tight",
        ink: majorityInk(line),
      });
    }
  }

  // 5) 去重 + 排序：同一色块的区域按 y/x 阅读序，便于后续解析合并。
  for (let i = 0; i < result.length; i++) {
    result[i] = dedupeRegions(result[i]);
    result[i].sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
  }
  return result;
}

/** 把垂直方向相交的文字词聚成“同一行”。 */
function groupTextLines(words: Word[]): Word[][] {
  if (words.length === 0) return [];
  const sorted = [...words].sort(
    (a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0,
  );
  const lines: Word[][] = [];
  for (const w of sorted) {
    const line = lines.find((l) => {
      const top = Math.min(...l.map((x) => x.box.y0));
      const bottom = Math.max(...l.map((x) => x.box.y1));
      return w.box.y0 <= bottom && w.box.y1 >= top;
    });
    if (line) line.push(w);
    else lines.push([w]);
  }
  return lines;
}

function unionBox(boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

function majorityInk(words: Word[]): "dark" | "light" {
  let dark = 0;
  for (const w of words) if (w.ink === "dark") dark++;
  return dark >= words.length - dark ? "dark" : "light";
}

function overlapsAnySwatch(w: TextWord, swatches: Swatch[]): boolean {
  const cx = (w.x0 + w.x1) / 2;
  const cy = (w.y0 + w.y1) / 2;
  return swatches.some(
    (s) => cx >= s.x0 && cx <= s.x1 && cy >= s.y0 && cy <= s.y1,
  );
}

/** 用“相邻色块中点半区”把文字水平归属给某个色块。 */
function assignByHalfSpan(rowSwatches: Swatch[], box: Box): number {
  const cx = (box.x0 + box.x1) / 2;
  const boundaries: number[] = [];
  for (let i = 0; i < rowSwatches.length; i++) {
    const s = rowSwatches[i];
    if (i === 0) {
      boundaries.push(s.x0 - (rowSwatches.length > 1 ? (rowSwatches[1].x0 - s.x1) / 2 : 0));
    } else {
      boundaries.push((rowSwatches[i - 1].x1 + s.x0) / 2);
    }
  }
  boundaries.push(
    rowSwatches[rowSwatches.length - 1].x1 +
      (rowSwatches.length > 1
        ? (rowSwatches[rowSwatches.length - 1].x0 - rowSwatches[rowSwatches.length - 2].x1) / 2
        : 0),
  );
  for (let i = 0; i < rowSwatches.length; i++) {
    if (cx >= boundaries[i] && cx <= boundaries[i + 1]) return i;
  }
  // 兜底：最近中心
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < rowSwatches.length; i++) {
    const s = rowSwatches[i];
    const d = Math.abs(cx - (s.x0 + s.x1) / 2);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function groupRows(swatches: Swatch[]): Array<{ row: number; swatches: Swatch[] }> {
  const map = new Map<number, Swatch[]>();
  for (const s of swatches) {
    const arr = map.get(s.row) ?? [];
    arr.push(s);
    map.set(s.row, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, sw]) => ({
      row,
      swatches: sw.sort((a, b) => a.x0 - b.x0),
    }));
}

function dedupeRegions(regions: OcrRegion[]): OcrRegion[] {
  const out: OcrRegion[] = [];
  for (const r of regions) {
    const dup = out.find((o) => boxesClose(o.box, r.box));
    if (!dup) out.push(r);
  }
  return out;
}

function boxesClose(a: Box, b: Box): boolean {
  const dx = Math.min(Math.abs(a.x0 - b.x0), Math.abs(a.x1 - b.x1));
  const dy = Math.min(Math.abs(a.y0 - b.y0), Math.abs(a.y1 - b.y1));
  return dx <= 2 && dy <= 2;
}
