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
  });
});
