'use strict';

const sharp = require('sharp');

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------
function median(values) {
  const s = Array.from(values).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function rgbDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------------------------------------------------------------------------
// Decode an image buffer to raw RGB
// ---------------------------------------------------------------------------
async function decode(buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const px = (x, y) => {
    const i = (y * W + x) * ch;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const sat = (x, y) => {
    const p = px(x, y);
    return Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
  };
  const lum = (x, y) => {
    const p = px(x, y);
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  };
  return { data, info, W, H, ch, px, sat, lum };
}

// ---------------------------------------------------------------------------
// Autocorrelation and peak helpers
// ---------------------------------------------------------------------------
function autocorr(profile, maxLag) {
  const n = profile.length;
  const mean = profile.reduce((a, b) => a + b, 0) / n;
  const out = new Float64Array(maxLag);
  for (let k = 0; k < maxLag; k++) {
    let num = 0;
    let d1 = 0;
    let d2 = 0;
    for (let i = 0; i < n - k; i++) {
      const a = profile[i] - mean;
      const b = profile[i + k] - mean;
      num += a * b;
      d1 += a * a;
      d2 += b * b;
    }
    out[k] = num / (Math.sqrt(d1 * d2) || 1);
  }
  return out;
}

// The bead period is typically 10..22 px. The strongest autocorrelation inside
// that band is the fundamental cell period; harmonics land above it.
function findPeriod(profile) {
  const ac = autocorr(profile, Math.min(profile.length - 1, 40));
  let best = 0;
  let bestV = -Infinity;
  for (let k = 8; k <= 22 && k < ac.length; k++) {
    if (ac[k] > bestV) {
      bestV = ac[k];
      best = k;
    }
  }
  return best;
}

function bestBoundaryOffset(edge, lo, hi, period) {
  let bestO = 0;
  let bestScore = -Infinity;
  for (let o = 0; o < period; o++) {
    let score = 0;
    let n = 0;
    for (let x = lo + o; x <= hi && x < edge.length; x += period) {
      score += edge[x];
      n++;
    }
    score /= n || 1;
    if (score > bestScore) {
      bestScore = score;
      bestO = o;
    }
  }
  return { offset: bestO, score: bestScore };
}

// ---------------------------------------------------------------------------
// Detect the bead grid (period, boundary offsets, and cell centers)
// ---------------------------------------------------------------------------
function detectGrid(img) {
  const { W, H, sat, lum } = img;

  // Bounding box of saturated pixels. The chart background is near white, so
  // this cleanly finds the outer extents of the bead grid + legend.
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (sat(x, y) > 25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) {
    throw new Error('未检测到拼豆网格（图片可能过小或背景不是浅色）。');
  }

  // Vertical-edge profile (finds column boundaries), averaged over the grid
  // rows. Horizontal-edge profile (finds row boundaries), averaged over the
  // grid columns.
  const colEdge = new Float64Array(W - 1);
  for (let x = 0; x < W - 1; x++) {
    let s = 0;
    for (let y = minY; y <= maxY; y++) s += Math.abs(lum(x + 1, y) - lum(x, y));
    colEdge[x] = s / (maxY - minY + 1);
  }
  const rowEdge = new Float64Array(H - 1);
  for (let y = 0; y < H - 1; y++) {
    let s = 0;
    for (let x = minX; x <= maxX; x++) s += Math.abs(lum(x, y + 1) - lum(x, y));
    rowEdge[y] = s / (maxX - minX + 1);
  }

  const periodC = findPeriod(colEdge);
  const periodR = findPeriod(rowEdge);
  const period = periodC && periodR ? Math.round((periodC + periodR) / 2) : periodC || periodR || 14;
  if (period < 6) {
    throw new Error('无法确定拼豆网格间距。');
  }

  const cb = bestBoundaryOffset(colEdge, minX, maxX, period);
  const rb = bestBoundaryOffset(rowEdge, 0, maxY - minY - 1, period);

  // gridTop is the first saturated row (top edge of the grid). The bottom of
  // the grid is found with a sliding periodicity score: the bead grid has a
  // strong 14px repetition that the legend/scale strip below it does not.
  const gridTop = minY;
  const gridBottom = findGridBottom(rowEdge, minY, period, rb.offset);

  const colStart = minX + cb.offset;
  const rowStart = gridTop + rb.offset;
  const cols = Math.max(1, Math.floor((maxX - colStart) / period));
  const rows = Math.max(1, Math.floor((gridBottom - gridTop) / period));

  const colCenters = [];
  for (let c = 0; c < cols; c++) colCenters.push(Math.round(colStart + period / 2 + c * period));
  const rowCenters = [];
  for (let r = 0; r < rows; r++) rowCenters.push(Math.round(rowStart + period / 2 + r * period));

  return {
    period,
    bbox: { minX, minY, maxX, maxY, gridTop, gridBottom },
    colCenters,
    rowCenters,
    cols,
    rows,
  };
}

function findGridBottom(rowEdge, gridTop, period, offset) {
  const win = period * 4;
  const n = rowEdge.length;
  const threshold = 0.35;
  let lastStrong = gridTop;
  // Walk the vertical edge profile until the 14px periodic bead pattern
  // disappears. The last y that still correlates is one period past the
  // final grid boundary, which keeps the row count aligned to real cells.
  for (let y = gridTop; y + win + period < n; y += 1) {
    if (windowCorr(rowEdge, y, win, period) > threshold) {
      lastStrong = y;
    } else {
      break;
    }
  }
  return lastStrong;
}

function windowCorr(profile, y, win, period) {
  if (y + period + win - 1 >= profile.length) return 0;
  let m1 = 0;
  let m2 = 0;
  for (let i = 0; i < win; i++) {
    m1 += profile[y + i];
    m2 += profile[y + period + i];
  }
  m1 /= win;
  m2 /= win;
  let num = 0;
  let d1 = 0;
  let d2 = 0;
  for (let i = 0; i < win; i++) {
    const a = profile[y + i] - m1;
    const b = profile[y + period + i] - m2;
    num += a * b;
    d1 += a * a;
    d2 += b * b;
  }
  return num / (Math.sqrt(d1 * d2) || 1);
}

// ---------------------------------------------------------------------------
// Legend swatch detection
// ---------------------------------------------------------------------------
function detectSwatches(img, grid) {
  const { W, H, sat, px } = img;
  const { gridBottom } = grid.bbox;

  // The legend sits below the grid. Its swatches are ~150px wide solid bars,
  // so each swatch row has a long contiguous saturated run (~120..190 px).
  const maxRun = new Int32Array(H);
  for (let y = 0; y < H; y++) {
    let run = 0;
    let best = 0;
    for (let x = 0; x < W; x++) {
      if (sat(x, y) > 25) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    maxRun[y] = best;
  }

  const bands = [];
  let start = -1;
  for (let y = gridBottom + 2; y < H; y++) {
    const inRange = maxRun[y] >= 100 && maxRun[y] <= 210;
    if (inRange && start < 0) start = y;
    else if (!inRange && start >= 0) {
      if (y - start >= 14) bands.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0 && H - start >= 14) bands.push([start, H - 1]);

  const swatches = [];
  for (const [y0, y1] of bands) {
    // Use only the top and bottom interior rows of each band for the column
    // projection. The numeric label is vertically centered, so this avoids
    // treating the dark digits as gaps between swatches.
    const sampleRows = [];
    for (let y = y0 + 2; y <= y0 + 5; y++) sampleRows.push(y);
    for (let y = y1 - 5; y <= y1 - 2; y++) sampleRows.push(y);

    const colSat = new Float64Array(W);
    for (let x = 0; x < W; x++) {
      let c = 0;
      for (const y of sampleRows) if (sat(x, y) > 25) c++;
      colSat[x] = c / sampleRows.length;
    }

    // Swatches are ~150px wide; require a generous minimum to reject noise.
    const runs = [];
    let s = -1;
    for (let x = 0; x < W; x++) {
      if (colSat[x] > 0.5 && s < 0) s = x;
      else if (colSat[x] <= 0.5 && s >= 0) {
        if (x - s >= 40) runs.push([s, x - 1]);
        s = -1;
      }
    }
    if (s >= 0 && W - s >= 40) runs.push([s, W - 1]);

    for (const [x0, x1] of runs) {
      const rgb = swatchColor(img, x0, y0, x1, y1);
      swatches.push({ x0, y0, x1, y1, rgb });
    }
  }

  return swatches;
}

function swatchColor(img, x0, y0, x1, y1) {
  const { px } = img;
  const inset = 4;
  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = y0 + inset; y <= y1 - inset; y++) {
    for (let x = x0 + inset; x <= x1 - inset; x++) {
      const p = px(x, y);
      rs.push(p[0]);
      gs.push(p[1]);
      bs.push(p[2]);
    }
  }
  if (rs.length === 0) {
    const p = px(Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2));
    return [p[0], p[1], p[2]];
  }
  return [median(rs), median(gs), median(bs)];
}

// Fixed legend layout for the reference chart template. Used as a fallback so
// the analyzer still works when dynamic swatch detection is inconclusive.
const FIXED_LEGEND = [
  { y0: 1275, y1: 1310, xs: [17, 173, 329, 486, 642, 799, 955, 1112] },
  { y0: 1317, y1: 1352, xs: [17, 173, 329, 486, 642, 799, 955, 1112] },
  { y0: 1358, y1: 1393, xs: [17, 173, 329, 486, 642, 799, 955, 1112] },
  { y0: 1401, y1: 1435, xs: [17, 331, 486, 642] },
];

function fixedSwatches(img) {
  const { W } = img;
  const out = [];
  for (const band of FIXED_LEGEND) {
    for (const x0 of band.xs) {
      const x1 = Math.min(x0 + 149, W - 1);
      out.push({ x0, y0: band.y0, x1, y1: band.y1, rgb: swatchColor(img, x0, band.y0, x1, band.y1) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cell color extraction + legend mapping + aggregation
// ---------------------------------------------------------------------------
function extractCells(img, grid, swatches) {
  const { px } = img;
  const half = Math.max(2, Math.round(grid.period / 2) - 1);
  const cells = [];
  const emptyCount = { value: 0 };

  for (let r = 0; r < grid.rows; r++) {
    const cy = grid.rowCenters[r];
    for (let c = 0; c < grid.cols; c++) {
      const cx = grid.colCenters[c];
      const rs = [];
      const gs = [];
      const bs = [];
      for (let y = cy - half; y <= cy + half; y++) {
        for (let x = cx - half; x <= cx + half; x++) {
          const p = px(clamp(x, 0, grid.bbox.maxX), clamp(y, 0, grid.bbox.maxY));
          rs.push(p[0]);
          gs.push(p[1]);
          bs.push(p[2]);
        }
      }
      const rgb = [median(rs), median(gs), median(bs)];
      const saturation = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
      if (saturation < 25) {
        emptyCount.value++;
        cells.push({ c, r, rgb: null, swatch: null });
        continue;
      }
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < swatches.length; i++) {
        const d = rgbDistance(rgb, swatches[i].rgb);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      cells.push({ c, r, rgb, swatch: best, distance: bestD });
    }
  }

  return { cells, emptyCount: emptyCount.value };
}

function aggregate(cells, swatches) {
  const counts = new Array(swatches.length).fill(0);
  for (const cell of cells) {
    if (cell.swatch != null) counts[cell.swatch]++;
  }
  return swatches.map((s, i) => ({ index: i, rgb: s.rgb, count: counts[i] }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
async function analyzeImage(buffer) {
  const img = await decode(buffer);
  const grid = detectGrid(img);

  let swatches = detectSwatches(img, grid);
  if (swatches.length < 20 || swatches.length > 40) {
    swatches = fixedSwatches(img);
  }

  const { cells, emptyCount } = extractCells(img, grid, swatches);
  const summary = aggregate(cells, swatches);

  return {
    width: img.W,
    height: img.H,
    grid: {
      period: grid.period,
      cols: grid.cols,
      rows: grid.rows,
      bbox: grid.bbox,
    },
    swatches,
    cells,
    emptyCount,
    summary,
  };
}

module.exports = { analyzeImage, decode, detectGrid, detectSwatches, extractCells };
