import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";

export interface TextWord extends Box {
  /** 文字为“深色墨迹”还是“浅色墨迹”（如印在深色色块上的白字） */
  ink: "dark" | "light";
}

interface Options {
  /**
   * true 表示在色块内部找字（浅色/深色墨迹都考虑，自动取少数派极值）；
   * false 表示在白色/浅色背景上找深色文字。
   */
  inside?: boolean;
}

/** 判断单个像素是否为深色墨迹（暗、且非彩色）。 */
function isDarkInk(v: number, sat: number): boolean {
  return v < 120 && sat < 0.35;
}

/** 判断单个像素是否为浅色墨迹（很亮、且非彩色，例如深色色块上的白字）。 */
function isLightInk(v: number, sat: number): boolean {
  return v > 205 && sat < 0.35;
}

/**
 * 在 region 内检测独立文字“词”的包围盒。
 *
 * 实现：
 * 1. 按亮度 + 饱和度筛出墨迹像素（深色墨迹，或浅色墨迹）。
 * 2. 8 连通聚类成字形，去掉过小的噪点。
 * 3. 同一行（y 方向有重叠）且横向间隙小的字形合并为一个“词”。
 */
export function detectTextWords(
  img: DecodedImage,
  region: Box,
  opts: Options = {},
): TextWord[] {
  const x0 = Math.max(0, Math.floor(region.x0));
  const y0 = Math.max(0, Math.floor(region.y0));
  const x1 = Math.min(img.width, Math.ceil(region.x1));
  const y1 = Math.min(img.height, Math.ceil(region.y1));
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return [];

  const w = x1 - x0;
  const h = y1 - y0;
  const ink = new Uint8Array(w * h); // 0 无, 1 深墨, 2 浅墨
  let darkCount = 0;
  let lightCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * img.width + (x0 + x)) * 3;
      const r = img.rgb[i];
      const g = img.rgb[i + 1];
      const b = img.rgb[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      const v = Math.round((r + g + b) / 3);
      const dark = isDarkInk(v, sat);
      const light = isLightInk(v, sat);
      if (dark) {
        ink[y * w + x] = 1;
        darkCount++;
      } else if (light) {
        ink[y * w + x] = 2;
        lightCount++;
      }
    }
  }

  // 色块内部：自动选择“少数派”极值作为墨迹，避免整块浅色/深色被当成文字。
  let target: 1 | 2 = 1;
  if (opts.inside) {
    if (darkCount === 0 && lightCount === 0) return [];
    if (lightCount === 0) target = 1;
    else if (darkCount === 0) target = 2;
    else target = lightCount < darkCount ? 2 : 1;
    const total = w * h;
    const chosen = target === 1 ? darkCount : lightCount;
    if (chosen / total > 0.55) return []; // 墨迹占比过高，多半不是文字
  } else {
    // 白底黑字
    if (darkCount === 0) return [];
  }

  const label = new Int32Array(w * h).fill(0);
  const glyphs: Array<{ minX: number; minY: number; maxX: number; maxY: number; n: number }> = [];
  let next = 1;
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (ink[start] === 0 || ink[start] !== target || label[start] !== 0) continue;
    const id = next++;
    label[start] = id;
    stack.push(start);
    let gMinX = w;
    let gMinY = h;
    let gMaxX = 0;
    let gMaxY = 0;
    let n = 0;
    while (stack.length > 0) {
      const p = stack.pop()!;
      const gx = p % w;
      const gy = Math.floor(p / w);
      n++;
      gMinX = Math.min(gMinX, gx);
      gMaxX = Math.max(gMaxX, gx);
      gMinY = Math.min(gMinY, gy);
      gMaxY = Math.max(gMaxY, gy);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (ink[ni] === target && label[ni] === 0) {
            label[ni] = id;
            stack.push(ni);
          }
        }
      }
    }
    if (n >= 5 && gMaxY - gMinY + 1 >= 3) {
      glyphs.push({ minX: gMinX, minY: gMinY, maxX: gMaxX, maxY: gMaxY, n });
    }
  }
  if (glyphs.length === 0) return [];

  // 先按 y 聚成“行”（y 区间相交的字形属于同一行）。
  glyphs.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  const lines: typeof glyphs[] = [];
  for (const g of glyphs) {
    let line = lines.find(
      (l) => g.minY <= l[l.length - 1].maxY && g.maxY >= l[l.length - 1].minY,
    );
    if (!line) {
      line = [];
      lines.push(line);
    }
    line.push(g);
  }

  // 行内按 x 排序，横向间隙超过阈值则断开成不同的“词”。
  const words: TextWord[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.minX - b.minX);
    let cur = { ...line[0] };
    const lineHeight = line.reduce((acc, g) => acc + (g.maxY - g.minY + 1), 0) / line.length;
    for (let i = 1; i < line.length; i++) {
      const gap = line[i].minX - cur.maxX;
      const gapLimit = Math.max(4, Math.min(10, lineHeight * 0.6));
      if (gap <= gapLimit) {
        cur.minX = Math.min(cur.minX, line[i].minX);
        cur.maxX = Math.max(cur.maxX, line[i].maxX);
        cur.minY = Math.min(cur.minY, line[i].minY);
        cur.maxY = Math.max(cur.maxY, line[i].maxY);
        cur.n += line[i].n;
      } else {
        words.push(toWord(cur, x0, y0, target));
        cur = { ...line[i] };
      }
    }
    words.push(toWord(cur, x0, y0, target));
  }

  words.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return words;
}

function toWord(
  g: { minX: number; minY: number; maxX: number; maxY: number; n: number },
  ox: number,
  oy: number,
  target: 1 | 2,
): TextWord {
  return {
    x0: ox + g.minX,
    y0: oy + g.minY,
    x1: ox + g.maxX + 1,
    y1: oy + g.maxY + 1,
    ink: target === 1 ? "dark" : "light",
  };
}
