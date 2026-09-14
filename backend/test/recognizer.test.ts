import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

/** 记录每次 ocrCrop 收到的 box/opts，用于断言「整块色块走灰度+inset」的约定。 */
const ocrCalls = vi.hoisted(() => ({
  calls: [] as Array<{
    box: { x0: number; y0: number; x1: number; y1: number };
    opts: Record<string, unknown>;
  }>,
}));

/** 零 inset 抢救重读时整块色块返回的文本（默认空=读不到，和真实一致）。 */
const rescue = vi.hoisted(() => ({ inset0Text: "" }));

vi.mock("../src/recognizer/ocr.js", () => ({
  ocrCrop: async (
    _img: unknown,
    box: { x0: number; y0: number; x1: number; y1: number },
    opts: Record<string, unknown> = {},
  ) => {
    ocrCalls.calls.push({ box, opts });
    // 整块色块区域较高、颜色单一，OCR 读不到字（和真实引擎一致）；
    // 但零 inset 的“抢救重读”能读回印在色块边缘的文字。
    const isCell = box.y1 - box.y0 >= 40;
    if (isCell) {
      if (opts.inset === 0 && rescue.inset0Text) {
        return { text: rescue.inset0Text, words: [fakeWord(rescue.inset0Text)] };
      }
      return { text: "", words: [] };
    }
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

/** 用 SVG 生成「色块 + 右侧文字」的测试图并跑 recognize。 */
async function runSvgWithBars(w: number, h: number, entries: Array<{ x: number; color: string; label: string }>) {
  let rects = "";
  for (const e of entries) {
    rects += `<rect x="${e.x}" y="40" width="60" height="60" fill="${e.color}"/>`;
    rects += `<text x="${e.x + 75}" y="78" font-family="Arial, sans-serif" font-size="26" fill="black">${e.label}</text>`;
  }
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="white"/>${rects}
    </svg>`,
  );
  const png = await sharp(svg).png().toBuffer();
  return recognize("test.png", png);
}

describe("recognize", () => {
  beforeEach(() => {
    rescue.inset0Text = "";
  });

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

  it("整块色块传给 ocrCrop 时带 inset + binarize:false，周边文字区域不带", async () => {
    ocrCalls.calls = [];
    bars = [
      { cx: 50, label: "A10(202)" },
      { cx: 290, label: "B03(56)" },
    ];
    await runSvgWithBars(480, 140, [
      { x: 20, color: "rgb(255,0,0)", label: "A10(202)" },
      { x: 260, color: "rgb(0,128,255)", label: "B03(56)" },
    ]);

    const cellCalls = ocrCalls.calls.filter((c) => c.box.y1 - c.box.y0 >= 40);
    const textCalls = ocrCalls.calls.filter((c) => c.box.y1 - c.box.y0 < 40);
    expect(cellCalls.length).toBeGreaterThan(0);
    expect(textCalls.length).toBeGreaterThan(0);
    for (const c of cellCalls) {
      expect(c.opts.binarize).toBe(false);
      expect(typeof c.opts.inset).toBe("number");
      expect(c.opts.inset as number).toBeGreaterThanOrEqual(4);
      expect(c.opts.psm).toBe(6);
    }
    for (const c of textCalls) {
      expect("binarize" in c.opts).toBe(false);
      expect("inset" in c.opts).toBe(false);
    }
  });

  it("编号退化成纯数字（OCR 丢字母）时给出结构可疑警告", async () => {
    ocrCalls.calls = [];
    bars = [
      { cx: 50, label: "A10(202)" },
      { cx: 290, label: "620(1076)" },
    ];
    const result = await runSvgWithBars(480, 140, [
      { x: 20, color: "rgb(255,0,0)", label: "A10(202)" },
      { x: 260, color: "rgb(163,90,64)", label: "620(1076)" },
    ]);
    expect(result.legend).toHaveLength(2);
    expect(result.legend[0].id).toBe("A10");
    expect(result.legend[1].id).toBe("620");
    expect(result.legend[1].count).toBe(1076);
    expect(result.warnings.some((w) => w.message.includes("结构可疑"))).toBe(true);
  });

  it("纯数字编号结构可疑时用零 inset 抢救重读（620 -> G20）", async () => {
    ocrCalls.calls = [];
    bars = [
      { cx: 50, label: "A10(202)" },
      { cx: 290, label: "620(1076)" },
    ];
    rescue.inset0Text = "G20(1076)";
    const result = await runSvgWithBars(480, 140, [
      { x: 20, color: "rgb(255,0,0)", label: "A10(202)" },
      { x: 260, color: "rgb(163,90,64)", label: "620(1076)" },
    ]);
    expect(result.legend).toHaveLength(2);
    expect(result.legend[1]).toMatchObject({ id: "G20", count: 1076 });
    expect(result.warnings.some((w) => w.message.includes("结构可疑"))).toBe(false);
    // 抢救确实发起过一次零 inset 的整块灰度读取
    expect(
      ocrCalls.calls.some((c) => c.opts.inset === 0 && c.opts.binarize === false),
    ).toBe(true);
  });

  it("纯字母编号结构可疑时用零 inset 抢救重读（MG -> M4）", async () => {
    ocrCalls.calls = [];
    bars = [
      { cx: 50, label: "A10(202)" },
      { cx: 290, label: "MG(64)" },
    ];
    rescue.inset0Text = "M4(64)";
    const result = await runSvgWithBars(480, 140, [
      { x: 20, color: "rgb(255,0,0)", label: "A10(202)" },
      { x: 260, color: "rgb(226,208,187)", label: "MG(64)" },
    ]);
    expect(result.legend).toHaveLength(2);
    expect(result.legend[1]).toMatchObject({ id: "M4", count: 64 });
    expect(result.warnings.some((w) => w.message.includes("结构可疑"))).toBe(false);
  });

  it("主结果编号合法时不触发零 inset 抢救", async () => {
    ocrCalls.calls = [];
    bars = [
      { cx: 50, label: "A10(202)" },
      { cx: 290, label: "B03(56)" },
    ];
    rescue.inset0Text = "B03(999)";
    const result = await runSvgWithBars(480, 140, [
      { x: 20, color: "rgb(255,0,0)", label: "A10(202)" },
      { x: 260, color: "rgb(0,128,255)", label: "B03(56)" },
    ]);
    expect(result.legend[1]).toMatchObject({ id: "B03", count: 56 });
    expect(ocrCalls.calls.some((c) => c.opts.inset === 0)).toBe(false);
  });

  it("无法识别的色块返回 failedCells（行/列/颜色/OCR 文本）", async () => {
    ocrCalls.calls = [];
    bars = [
      { cx: 50, label: "A10(202)" },
      { cx: 290, label: "" },
    ];
    const result = await runSvgWithBars(480, 140, [
      { x: 20, color: "rgb(255,0,0)", label: "A10(202)" },
      { x: 260, color: "rgb(0,128,255)", label: "" },
    ]);
    expect(result.legend).toHaveLength(1);
    expect(result.legend[0].id).toBe("A10");
    expect(result.failedCells).toHaveLength(1);
    expect(result.failedCells[0]).toMatchObject({
      row: 1,
      col: 2,
      rgb: { r: 0, g: 128, b: 255 },
    });
    expect(result.warnings.some((w) => w.message.includes("识别失败"))).toBe(true);
  });
});
