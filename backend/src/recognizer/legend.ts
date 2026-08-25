import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";

export interface Swatch extends Box {
  row: number;
}

interface Component {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

export function detectSwatches(img: DecodedImage): Swatch[] {
  const stride = 2;
  const mw = Math.ceil(img.width / stride);
  const mh = Math.ceil(img.height / stride);
  const mask = new Uint8Array(mw * mh);

  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      const x = Math.min(mx * stride, img.width - 1);
      const y = Math.min(my * stride, img.height - 1);
      const i = (y * img.width + x) * 3;
      const r = img.rgb[i];
      const g = img.rgb[i + 1];
      const b = img.rgb[i + 2];
      const mxv = Math.max(r, g, b);
      const mnv = Math.min(r, g, b);
      const sat = mxv === 0 ? 0 : (mxv - mnv) / mxv;
      const bright = mxv >= 70;
      mask[my * mw + mx] = sat > 0.45 && bright ? 1 : 0;
    }
  }

  const components = findComponents(mask, mw, mh);
  const candidates = components
    .map((c) => ({
      ...c,
      w: c.maxX - c.minX + 1,
      h: c.maxY - c.minY + 1,
      ratio: (c.maxX - c.minX + 1) / (c.maxY - c.minY + 1),
    }))
    .filter(
      (c) =>
        c.area >= 24 &&
        c.w >= 8 &&
        c.h >= 8 &&
        c.ratio >= 0.7 &&
        c.ratio <= 1.6,
    );

  const sorted = [...candidates].sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  const rows: typeof candidates[] = [];
  for (const c of sorted) {
    const row = rows.find(
      (r) => Math.abs(r[0].minY - c.minY) <= Math.max(8, r[0].h * 0.7),
    );
    if (row) row.push(c);
    else rows.push([c]);
  }
  rows.sort((a, b) => a[0].minY - b[0].minY);

  return rows.flatMap((row, rowIndex) =>
    row
      .sort((a, b) => a.minX - b.minX)
      .map((c) => ({
        row: rowIndex,
        x0: c.minX * stride,
        y0: c.minY * stride,
        x1: Math.min((c.maxX + 1) * stride, img.width),
        y1: Math.min((c.maxY + 1) * stride, img.height),
      })),
  );
}

function findComponents(mask: Uint8Array, w: number, h: number): Component[] {
  const label = new Int32Array(w * h).fill(0);
  const components: Component[] = [];
  let next = 1;
  const stack: number[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || label[start] !== 0) continue;
    const id = next++;
    const comp: Component = {
      id,
      minX: w,
      minY: h,
      maxX: 0,
      maxY: 0,
      area: 0,
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
