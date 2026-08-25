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
