import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { recognize } from "../src/recognizer/index.js";

function fakeWord(text: string): {
  text: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return { text, confidence: 92, x: 0, y: 0, w: 0, h: 0 };
}

/** 每个用例先设置本图的色块中心 -> 标签；mock OCR 把文字区域归给最近的色块。 */
let bars: Array<{ cx: number; label: string }> = [];

vi.mock("../src/recognizer/ocr.js", () => ({
  ocrCrop: async (
    _img: unknown,
    box: { x0: number; y0: number; x1: number; y1: number },
  ) => {
    // 整块色块区域较高、颜色单一，OCR 读不到字（和真实引擎一致）。
    const isCell = box.y1 - box.y0 >= 40;
    if (isCell) return { text: "", words: [] };
    const cx = (box.x0 + box.x1) / 2;
    let best = bars[0];
    let bestD = Infinity;
    for (const b of bars) {
      const d = Math.abs(cx - b.cx);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return { text: best.label, words: [fakeWord(best.label)] };
  },
}));

describe("recognize", () => {
  it("pairs text printed to the right of swatches (layout-agnostic)", async () => {
    bars = [
      { cx: 50, label: "A10(202)" },
      { cx: 290, label: "B03(56)" },
    ];
    const w = 480;
    const h = 140;
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        <rect x="20" y="40" width="60" height="60" fill="rgb(255,0,0)"/>
        <text x="95" y="78" font-family="Arial, sans-serif" font-size="26" fill="black">A10(202)</text>
        <rect x="260" y="40" width="60" height="60" fill="rgb(0,128,255)"/>
        <text x="335" y="78" font-family="Arial, sans-serif" font-size="26" fill="black">B03(56)</text>
      </svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const result = await recognize("test.png", png);
    expect(result.legend.length).toBe(2);
    expect(result.legend[0].id).toBe("A10");
    expect(result.legend[0].count).toBe(202);
    expect(result.legend[0].rgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(result.legend[1].id).toBe("B03");
    expect(result.legend[1].count).toBe(56);
    expect(result.legend[1].rgb).toEqual({ r: 0, g: 128, b: 255 });
  });

  it("pairs a full text line printed above each wide color bar", async () => {
    bars = [
      { cx: 70, label: "A10(202)" },
      { cx: 210, label: "B03(56)" },
      { cx: 350, label: "C07(88)" },
    ];
    const w = 420;
    const h = 160;
    const colors = ["rgb(255,0,0)", "rgb(0,128,255)", "rgb(0,180,0)"];
    const xs = [10, 150, 290];
    const labels = ["A10(202)", "B03(56)", "C07(88)"];
    let rects = "";
    for (let i = 0; i < colors.length; i++) {
      rects += `<rect x="${xs[i]}" y="100" width="120" height="44" fill="${colors[i]}"/>`;
      rects += `<text x="${xs[i]}" y="94" font-family="Arial, sans-serif" font-size="20" fill="black">${labels[i]}</text>`;
    }
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        ${rects}
      </svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const result = await recognize("test.png", png);
    expect(result.legend.length).toBe(3);
    expect(result.legend[0]).toMatchObject({ id: "A10", count: 202 });
    expect(result.legend[1]).toMatchObject({ id: "B03", count: 56 });
    expect(result.legend[2]).toMatchObject({ id: "C07", count: 88 });
    expect(result.legend.map((l) => l.rgb)).toEqual([
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 128, b: 255 },
      { r: 0, g: 180, b: 0 },
    ]);
  });
});
