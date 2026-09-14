import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { decodeRgb, type DecodedImage } from "../src/recognizer/decode.js";
import {
  ocrCrop,
  setOcrEngineForTests,
  type OcrEngine,
} from "../src/recognizer/ocr.js";

/** 假引擎：不解码文字，只把收到的图片文件解码成灰度统计，供断言预处理结果。 */
interface SeenStats {
  width: number;
  height: number;
  unique: number; // 不同灰阶数（灰度图 >> 2，二值化图 ≈ 2）
  mean: number; // 平均灰阶
  dark: number; // <64 的像素占比
  light: number; // >192 的像素占比
}

let seen: SeenStats[] = [];
const fakeEngine: OcrEngine = {
  name: "fake",
  async recognize(imagePath) {
    const { data, info } = await sharp(imagePath)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const vals = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const uniq = new Set<number>();
    let sum = 0;
    let dark = 0;
    let light = 0;
    for (const v of vals) {
      uniq.add(v);
      sum += v;
      if (v < 64) dark++;
      else if (v > 192) light++;
    }
    seen.push({
      width: info.width,
      height: info.height,
      unique: uniq.size,
      mean: sum / vals.length,
      dark: dark / vals.length,
      light: light / vals.length,
    });
    return [{ text: "A10(202)", confidence: 90, x: 0, y: 0, w: 0, h: 0 }];
  },
};

async function renderCellSvg(opts: {
  bg: string;
  textFill: string;
  cellSize?: number;
}): Promise<DecodedImage> {
  const size = opts.cellSize ?? 100;
  const svg = Buffer.from(
    `<svg width="${size + 40}" height="${size + 40}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size + 40}" height="${size + 40}" fill="white"/>
      <rect x="20" y="20" width="${size}" height="${size}" fill="${opts.bg}"/>
      <text x="38" y="82" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="${opts.textFill}">A10(202)</text>
    </svg>`,
  );
  const png = await sharp(svg).png().toBuffer();
  return decodeRgb(png);
}

describe("ocrCrop 预处理（色块内文字）", () => {
  beforeEach(() => {
    seen = [];
    setOcrEngineForTests(fakeEngine);
  });
  afterEach(() => setOcrEngineForTests(null));

  it("binarize:false 时喂给引擎的是多灰阶灰度图（不二值化）", async () => {
    const img = await renderCellSvg({ bg: "rgb(210,180,140)", textFill: "black" });
    await ocrCrop(img, { x0: 20, y0: 20, x1: 120, y1: 120 }, { binarize: false, psm: 6 });
    expect(seen).toHaveLength(1);
    // 灰度图（含抗锯齿）应保留大量灰阶；若被 Otsu 二值化会只剩 0/255 两个值。
    expect(seen[0].unique).toBeGreaterThan(8);
  });

  it("binarize 默认（true）：浅底深字输出二值图且极性不反转（黑字）", async () => {
    const img = await renderCellSvg({ bg: "rgb(235,235,235)", textFill: "black" });
    await ocrCrop(img, { x0: 20, y0: 20, x1: 120, y1: 120 }, { psm: 6 });
    expect(seen).toHaveLength(1);
    expect(seen[0].unique).toBeLessThanOrEqual(2); // 硬二值化
    expect(seen[0].mean).toBeGreaterThan(128); // 背景白为主
    expect(seen[0].dark).toBeGreaterThan(0); // 仍保留深色墨迹
  });

  it("binarize 默认（true）：深底浅字自动判为浅字，不误反相成黑字", async () => {
    const img = await renderCellSvg({ bg: "rgb(55,55,55)", textFill: "white" });
    await ocrCrop(img, { x0: 20, y0: 20, x1: 120, y1: 120 }, { psm: 6 });
    expect(seen).toHaveLength(1);
    expect(seen[0].unique).toBeLessThanOrEqual(2);
    // 深底浅字：代码按极性把浅字反相成黑字，喂给引擎的仍是「黑字白底」。
    expect(seen[0].mean).toBeGreaterThan(128);
    expect(seen[0].dark).toBeGreaterThan(0);
  });

  it("inset 会把送入 OCR 的区域往内收（图像更小、避开边框）", async () => {
    const img = await renderCellSvg({ bg: "rgb(210,180,140)", textFill: "black" });
    await ocrCrop(img, { x0: 20, y0: 20, x1: 120, y1: 120 }, { binarize: false, inset: 0, psm: 6 });
    await ocrCrop(img, { x0: 20, y0: 20, x1: 120, y1: 120 }, { binarize: false, inset: 8, psm: 6 });
    expect(seen).toHaveLength(2);
    // 100px 色块：inset 0 的目标高度 = max(64, 100*4)=400；inset 8 后 crop 84px => 336。
    expect(seen[0].height).toBeGreaterThan(seen[1].height);
  });
});
