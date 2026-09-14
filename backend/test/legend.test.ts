import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeRgb } from "../src/recognizer/decode.js";
import { detectSwatches } from "../src/recognizer/legend.js";

describe("detectSwatches", () => {
  it("finds two saturated swatches in a row", async () => {
    const w = 220;
    const h = 80;
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        <rect x="20" y="20" width="40" height="40" fill="rgb(255,0,0)"/>
        <rect x="120" y="20" width="40" height="40" fill="rgb(0,128,255)"/>
      </svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const img = await decodeRgb(png);
    const swatches = detectSwatches(img);
    expect(swatches.length).toBeGreaterThanOrEqual(2);
    expect(new Set(swatches.map((s) => s.row)).size).toBe(1);
    const xs = swatches.map((s) => s.x0);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    for (const s of swatches) {
      expect(s.x1).toBeGreaterThan(s.x0);
      expect(s.y1).toBeGreaterThan(s.y0);
    }
  });

  it("rejects a saturated but multicolored region", async () => {
    const w = 220;
    const h = 140;
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        <rect x="40" y="30" width="40" height="80" fill="rgb(255,0,0)"/>
        <rect x="80" y="30" width="40" height="80" fill="rgb(0,0,255)"/>
      </svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const img = await decodeRgb(png);
    expect(detectSwatches(img).length).toBe(0);
  });
});

describe("detectSwatches (band path)", () => {
  it("detects wide color-bar rows like real bead charts", async () => {
    const w = 800;
    const h = 200;
    const colors = [
      "rgb(255,0,0)", "rgb(255,128,0)", "rgb(255,255,0)", "rgb(0,255,0)",
      "rgb(0,128,255)", "rgb(128,0,255)",
    ];
    let rects = "";
    for (let row = 0; row < 3; row++) {
      for (let c = 0; c < colors.length; c++) {
        const x = 10 + c * 130;
        const y = 10 + row * 60;
        rects += `<rect x="${x}" y="${y}" width="120" height="44" fill="${colors[c]}"/>`;
      }
    }
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        ${rects}
      </svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const img = await decodeRgb(png);
    const swatches = detectSwatches(img);
    expect(swatches.length).toBeGreaterThanOrEqual(15);
    expect(swatches.every((s) => s.y0 >= 8 && s.y1 <= h - 8)).toBe(true);
  });
});

describe("detectSwatches (real drawing regression)", () => {
  it("recovers the bottom legend bars of 图纸.jpg without pattern noise", async () => {
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(new URL("../../图纸.jpg", import.meta.url));
    const img = await decodeRgb(buf);
    const swatches = detectSwatches(img);
    expect(swatches.length).toBeGreaterThanOrEqual(20);
    // 全部落在底部图例区，而不是图案区
    expect(swatches.every((s) => s.y0 >= 1200)).toBe(true);
    const rows = new Set(swatches.map((s) => s.row));
    expect(rows.size).toBeGreaterThanOrEqual(3);
  });
});
