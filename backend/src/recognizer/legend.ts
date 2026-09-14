import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";

export interface Swatch extends Box {
  /** 所在行号（按 y 聚类，用于排序/配对） */
  row: number;
}

interface Band {
  start: number;
  end: number;
}

/** 判定一个像素是否“有色”（图例色块、甚至偏淡的粉/黄都算）。 */
function isColorful(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  return (sat > 0.12 && mx >= 50) || (mx - mn >= 30 && mx >= 50);
}

/**
 * 检测图片中的“图例色块”。
 *
 * 图纸图例布局不固定：
 * - 最常见的是成行的宽色条（文字印在色块内部，如 图纸.jpg 底部三行宽条）；
 * - 也可能是成行/成列的小方块（编号/数量印在色块旁边）；
 * - 还可能是单列竖排的色块。
 *
 * 策略是“双通道 + 合并”：
 * 1. 条带通道（band）：扫描整行都充满若干条“较长且颜色均匀”色带的区域，
 *    这类区域几乎不可能是图案网格，能稳定抓出 图纸.jpg 之类的宽条图例。
 * 2. 连通域通道（fallback）：只有当条带通道没有结果时才启用——
 *    在小方块/单列图例上按“成行或成列、同尺寸、颜色一致”的约束收集色块，
 *    避免把图案区的大片杂色误当图例。
 */
export function detectSwatches(img: DecodedImage): Swatch[] {
  const { width: w, height: h, rgb } = img;
  if (w < 8 || h < 8) return [];

  const colorful = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 3;
    colorful[i] = isColorful(rgb[j], rgb[j + 1], rgb[j + 2]) ? 1 : 0;
  }

  const bands = detectBands(rgb, colorful, w, h);
  if (bands.length > 0) return bands;

  // 条带通道失败 -> 退化到连通域通道（方块/单列图例）。
  return detectCompactSwatches(img);
}

/* ============================ 通道 1：条带检测 ============================ */

// 调参说明：主要针对“成行宽色条”的图例；真图（1280px 宽）每条约 150px。
const LONG_RUN = 60; // 一行内“长色带”的最短长度
const MAX_RUN_SPREAD = 100; // 色带内部颜色跨度上限（JPEG 容差）
const SEED_TOLERANCE = 25; // 种子行聚类容差
const EMPTY_ROW_PIXELS = 8; // “空行”的判定阈值
const MIN_BAND_HEIGHT = 12;
const CELL_WIDTH_MIN = 40;
const CELL_WIDTH_MAX = 400;
const MIN_CELLS_IN_BAND = 3; // 至少 3 个色块才算图例行
const GAP_MIN = 3;
const MIN_CELL_WIDTH = 24;
const COLUMN_CLUSTER_RADIUS = 14;
const CONTENT_COLORFUL_RATIO = 0.03;
const CONTENT_TEXT_RATIO = 0.015;
const TEXT_DISTANCE = 160;

function detectBands(
  rgb: Uint8Array,
  colorful: Uint8Array,
  w: number,
  h: number,
): Swatch[] {
  // --- 1. 种子行：一行里有多条“较长且均匀”的色带 -----------------------
  const seeds: number[] = [];
  for (let y = 0; y < h; y++) {
    const runs = rowRuns(y, colorful, w);
    let coverage = 0;
    let nUniform = 0;
    for (const [a, b] of runs) coverage += b - a + 1;
    coverage /= w;
    for (const [a, b] of runs) {
      if (b - a + 1 >= LONG_RUN && runSpread(rgb, w, y, a, b) <= MAX_RUN_SPREAD) {
        nUniform++;
      }
    }
    if (nUniform >= 2 && coverage >= 0.3) seeds.push(y);
  }

  // --- 2. 种子行聚类成候选区域 -------------------------------------------
  const clusters: Band[] = [];
  for (const y of seeds) {
    const last = clusters[clusters.length - 1];
    if (last && y - last.end <= SEED_TOLERANCE) last.end = y;
    else clusters.push({ start: y, end: y });
  }

  // --- 3. 在近空行处切开成“条带” ----------------------------------------
  const bands: Band[] = [];
  for (const cluster of clusters) {
    let cur: Band | null = null;
    for (let y = cluster.start; y <= cluster.end; y++) {
      let cnt = 0;
      const base = y * w;
      for (let x = 0; x < w; x++) cnt += colorful[base + x];
      if (cnt >= EMPTY_ROW_PIXELS) {
        if (!cur) cur = { start: y, end: y };
        else cur.end = y;
      } else if (cur) {
        bands.push(cur);
        cur = null;
      }
    }
    if (cur) bands.push(cur);
  }

  // --- 4. 校验条带 --------------------------------------------------------
  const validBands = bands.filter((b) => {
    const height = b.end - b.start + 1;
    let seedCount = 0;
    for (const y of seeds) if (y >= b.start && y <= b.end) seedCount++;
    return height >= MIN_BAND_HEIGHT && seedCount >= 2;
  });
  if (validBands.length === 0) return [];

  // --- 5. 每个条带切分成格 ------------------------------------------------
  const detected = validBands.map((band) => ({
    band,
    cells: splitBandCells(band, colorful, w),
  }));

  // --- 6. 只保留“真图例行”：一格宽度落在合理区间内的格数够多 ------------
  const realBands = detected.filter(
    ({ cells }) =>
      cells.filter(([a, b]) => {
        const width = b - a + 1;
        return width >= CELL_WIDTH_MIN && width <= CELL_WIDTH_MAX;
      }).length >= MIN_CELLS_IN_BAND,
  );
  if (realBands.length === 0) return [];

  // --- 7. 所有条带共享同一套列边界（抑制单行噪声） ------------------------
  const boundaries = alignColumns(realBands, w);

  // --- 8. 内容检查后输出色块 ---------------------------------------------
  const swatches: Swatch[] = [];
  for (let bi = 0; bi < realBands.length; bi++) {
    const { band } = realBands[bi];
    for (let ci = 0; ci < boundaries.length - 1; ci++) {
      const x0 = boundaries[ci];
      const x1 = boundaries[ci + 1];
      if (cellHasContent(band, x0, x1, colorful, rgb, w)) {
        swatches.push({ row: bi, x0, y0: band.start, x1, y1: band.end + 1 });
      }
    }
  }
  return swatches;
}

function rowRuns(y: number, colorful: Uint8Array, w: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  const base = y * w;
  let inRun = false;
  let start = 0;
  for (let x = 0; x < w; x++) {
    const c = colorful[base + x];
    if (c && !inRun) {
      inRun = true;
      start = x;
    } else if (!c && inRun) {
      inRun = false;
      runs.push([start, x - 1]);
    }
  }
  if (inRun) runs.push([start, w - 1]);
  return runs;
}

function runSpread(rgb: Uint8Array, w: number, y: number, a: number, b: number): number {
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (let x = a; x <= b; x++) {
    const j = (y * w + x) * 3;
    const r = rgb[j], g = rgb[j + 1], bl = rgb[j + 2];
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (bl < minB) minB = bl;
    if (bl > maxB) maxB = bl;
  }
  return Math.max(maxR - minR, maxG - minG, maxB - minB);
}

function splitBandCells(
  band: Band,
  colorful: Uint8Array,
  w: number,
): Array<[number, number]> {
  const colCount = new Array<number>(w).fill(0);
  for (let y = band.start; y <= band.end; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) colCount[x] += colorful[base + x];
  }
  const threshold = Math.max(2, (band.end - band.start + 1) * 0.15);

  const gaps: Array<[number, number]> = [];
  let inGap = false;
  let gapStart = 0;
  for (let x = 0; x < w; x++) {
    const isGap = colCount[x] < threshold;
    if (isGap && !inGap) {
      inGap = true;
      gapStart = x;
    }
    if (!isGap && inGap) {
      inGap = false;
      if (x - gapStart >= GAP_MIN) gaps.push([gapStart, x - 1]);
    }
  }
  if (inGap && w - gapStart >= GAP_MIN) gaps.push([gapStart, w - 1]);

  let minX = w;
  let maxX = -1;
  for (let x = 0; x < w; x++) {
    if (colCount[x] >= threshold) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (maxX < 0) return [];

  const cells: Array<[number, number]> = [];
  let last = minX;
  for (const [ga, gb] of gaps) {
    const mid = Math.round((ga + gb) / 2);
    if (mid - last >= MIN_CELL_WIDTH && gb < maxX) {
      cells.push([last, mid]);
      last = mid + 1;
    }
  }
  if (maxX - last >= MIN_CELL_WIDTH) cells.push([last, maxX]);
  return cells;
}

function alignColumns(
  realBands: Array<{ band: Band; cells: Array<[number, number]> }>,
  w: number,
): number[] {
  const counts = new Map<number, number>();
  for (const { cells } of realBands) {
    for (let i = 0; i < cells.length - 1; i++) {
      const mid = Math.round((cells[i][1] + cells[i + 1][0]) / 2);
      counts.set(mid, (counts.get(mid) ?? 0) + 1);
    }
  }

  const sorted = [...counts.keys()].sort((a, b) => a - b);
  const clusters: Array<{ start: number; end: number; n: number }> = [];
  for (const mid of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && mid - last.end <= COLUMN_CLUSTER_RADIUS) {
      last.end = mid;
      last.n += counts.get(mid)!;
    } else {
      clusters.push({ start: mid, end: mid, n: counts.get(mid)! });
    }
  }

  // 多行时列边界需被至少两行支持，抑制单行噪声。
  const requireSupport = realBands.length >= 2;
  const internal = clusters
    .filter((c) => !requireSupport || c.n >= 2)
    .map((c) => Math.round((c.start + c.end) / 2));

  let left = w;
  let right = -1;
  for (const { cells } of realBands) {
    for (const [a, b] of cells) {
      if (a < left) left = a;
      if (b > right) right = b;
    }
  }
  if (right < 0) right = 0;
  return [left, ...internal, right + 1];
}

function cellHasContent(
  band: Band,
  x0: number,
  x1: number,
  colorful: Uint8Array,
  rgb: Uint8Array,
  w: number,
): boolean {
  const height = band.end - band.start + 1;
  const total = (x1 - x0) * height;
  const hist = new Map<number, number>();
  let colorfulCount = 0;

  for (let y = band.start; y <= band.end; y++) {
    const base = y * w;
    for (let x = x0; x < x1; x++) {
      const i = base + x;
      colorfulCount += colorful[i];
      const j = i * 3;
      const key = ((rgb[j] >> 4) << 8) | ((rgb[j + 1] >> 4) << 4) | (rgb[j + 2] >> 4);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }
  if (colorfulCount / total > CONTENT_COLORFUL_RATIO) return true;

  // 极浅/白色色块：靠“与背景主色差异较大的文字像素”判断有没有内容。
  let bestKey = -1;
  let bestN = 0;
  for (const [k, n] of hist) {
    if (n > bestN) {
      bestN = n;
      bestKey = k;
    }
  }
  if (bestKey < 0) return false;
  const bgR = (bestKey >> 8) << 4;
  const bgG = ((bestKey >> 4) & 15) << 4;
  const bgB = (bestKey & 15) << 4;

  let textCount = 0;
  for (let y = band.start; y <= band.end; y++) {
    const base = y * w;
    for (let x = x0; x < x1; x++) {
      const j = (base + x) * 3;
      const dist =
        Math.abs(rgb[j] - bgR) + Math.abs(rgb[j + 1] - bgG) + Math.abs(rgb[j + 2] - bgB);
      if (dist > TEXT_DISTANCE) textCount++;
    }
  }
  return textCount / total > CONTENT_TEXT_RATIO;
}

/* ==================== 通道 2：连通域（方块/单列图例） ==================== */

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  minR: number;
  maxR: number;
  minG: number;
  maxG: number;
  minB: number;
  maxB: number;
}

/**
 * 连通域通道：适合“成排/成列的小方块”图例。
 * 约束：必须是“成行或成列”的 ≥2 个同尺寸候选，颜色单一，尺寸在合理范围。
 */
function detectCompactSwatches(img: DecodedImage): Swatch[] {
  const { width, height, rgb } = img;
  const stride = 2;
  const mw = Math.ceil(width / stride);
  const mh = Math.ceil(height / stride);
  const mask = new Uint8Array(mw * mh);
  const dr = new Uint8Array(mw * mh);
  const dg = new Uint8Array(mw * mh);
  const db = new Uint8Array(mw * mh);

  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      const x = Math.min(mx * stride, width - 1);
      const y = Math.min(my * stride, height - 1);
      const i = (y * width + x) * 3;
      const r = rgb[i];
      const g = rgb[i + 1];
      const b = rgb[i + 2];
      const mxv = Math.max(r, g, b);
      const mnv = Math.min(r, g, b);
      const sat = mxv === 0 ? 0 : (mxv - mnv) / mxv;
      const bright = mxv >= 50;
      mask[my * mw + mx] = isColorful(r, g, b) && bright ? 1 : 0;
      dr[my * mw + mx] = r;
      dg[my * mw + mx] = g;
      db[my * mw + mx] = b;
    }
  }

  const components = findComponents(mask, dr, dg, db, mw, mh);
  const candidates = components
    .map((c) => {
      const cw = c.maxX - c.minX + 1;
      const ch = c.maxY - c.minY + 1;
      const fill = c.area / (cw * ch);
      const spread = Math.max(c.maxR - c.minR, c.maxG - c.minG, c.maxB - c.minB);
      return { c, cw, ch, fill, spread, area: c.area };
    })
    .filter(
      (x) =>
        x.area >= 12 &&
        x.cw >= 4 &&
        x.ch >= 4 &&
        x.cw <= mw * 0.85 &&
        x.ch <= mh * 0.85 &&
        x.cw * x.ch <= 20000 &&
        x.cw / x.ch >= 0.4 &&
        x.cw / x.ch <= 6.0 &&
        x.fill >= 0.5 &&
        x.spread <= 80,
    )
    .map((x) => ({
      x0: x.c.minX * stride,
      y0: x.c.minY * stride,
      x1: Math.min((x.c.maxX + 1) * stride, width),
      y1: Math.min((x.c.maxY + 1) * stride, height),
      cw: x.cw * stride,
      ch: x.ch * stride,
    }));

  // 按 y 聚成“行”、按 x 聚成“列”。
  const sorted = [...candidates].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const rowGroups: typeof candidates[] = [];
  for (const c of sorted) {
    const g = rowGroups.find(
      (r) => Math.abs(r[0].y0 - c.y0) <= Math.max(6, r[0].ch * 0.8),
    );
    if (g) g.push(c);
    else rowGroups.push([c]);
  }

  const byCol = [...candidates].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
  const colGroups: typeof candidates[] = [];
  for (const c of byCol) {
    const g = colGroups.find(
      (r) => Math.abs(r[0].x0 - c.x0) <= Math.max(6, r[0].cw * 0.8),
    );
    if (g) g.push(c);
    else colGroups.push([c]);
  }

  // 行内尺寸一致性检查：同行候选高度应接近。
  const rowOk = new Set<typeof candidates[number]>();
  for (const g of rowGroups) {
    if (g.length < 2) continue;
    const medianH = g.map((c) => c.ch).sort((a, b) => a - b)[Math.floor(g.length / 2)];
    const ok = g.filter((c) => Math.abs(c.ch - medianH) <= medianH * 0.5);
    if (ok.length >= 2) for (const c of ok) rowOk.add(c);
  }
  const colOk = new Set<typeof candidates[number]>();
  for (const g of colGroups) {
    if (g.length < 2) continue;
    const medianW = g.map((c) => c.cw).sort((a, b) => a - b)[Math.floor(g.length / 2)];
    const ok = g.filter((c) => Math.abs(c.cw - medianW) <= medianW * 0.5);
    if (ok.length >= 2) for (const c of ok) colOk.add(c);
  }

  const kept = candidates.filter((c) => rowOk.has(c) || colOk.has(c));
  if (kept.length === 0) return [];

  // 重新为每个保留候选计算行号（用于配对时识别同行）。
  const keptSorted = [...kept].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const finalRows: typeof keptSorted[] = [];
  for (const c of keptSorted) {
    const g = finalRows.find(
      (r) => Math.abs(r[0].y0 - c.y0) <= Math.max(6, r[0].ch * 0.8),
    );
    if (g) g.push(c);
    else finalRows.push([c]);
  }
  return finalRows.flatMap((g, i) =>
    g
      .sort((a, b) => a.x0 - b.x0)
      .map((c) => ({ row: i, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 })),
  );
}

function findComponents(
  mask: Uint8Array,
  dr: Uint8Array,
  dg: Uint8Array,
  db: Uint8Array,
  w: number,
  h: number,
): Component[] {
  const label = new Int32Array(w * h).fill(0);
  const components: Component[] = [];
  let next = 1;
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || label[start] !== 0) continue;
    const id = next++;
    const comp: Component = {
      minX: w,
      minY: h,
      maxX: 0,
      maxY: 0,
      area: 0,
      minR: 255,
      maxR: 0,
      minG: 255,
      maxG: 0,
      minB: 255,
      maxB: 0,
    };
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % w;
      const y = Math.floor(p / w);
      comp.minX = Math.min(comp.minX, x);
      comp.minY = Math.min(comp.minY, y);
      comp.maxX = Math.max(comp.maxX, x);
      comp.maxY = Math.max(comp.maxY, y);
      comp.area++;
      comp.minR = Math.min(comp.minR, dr[p]);
      comp.maxR = Math.max(comp.maxR, dr[p]);
      comp.minG = Math.min(comp.minG, dg[p]);
      comp.maxG = Math.max(comp.maxG, dg[p]);
      comp.minB = Math.min(comp.minB, db[p]);
      comp.maxB = Math.max(comp.maxB, db[p]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (mask[ni] === 1 && label[ni] === 0) {
          label[ni] = id;
          stack.push(ni);
        }
      }
    }
    components.push(comp);
  }
  return components;
}
