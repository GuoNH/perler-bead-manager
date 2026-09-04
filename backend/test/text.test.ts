import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeRgb } from "../src/recognizer/decode.js";
import { detectTextWords } from "../src/recognizer/text.js";

async function svgImage(body: string, w = 420, h = 120) {
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="white"/>
      ${body}
    </svg>`,
  );
  return decodeRgb(await sharp(svg).png().toBuffer());
}

describe("detectTextWords", () => {
  it("finds dark words on white background and splits by gap", async () => {
    const img = await svgImage(
      `<text x="20" y="60" font-family="Arial, sans-serif" font-size="28" fill="black">A10(202)</text>
       <text x="220" y="60" font-family="Arial, sans-serif" font-size="28" fill="black">B03 56</text>`,
    );
    const words = detectTextWords(img, { x0: 0, y0: 0, x1: 420, y1: 120 });
    // A10(202) 无空格会是一个词；B03 与 56 之间有空格，应被拆开
    expect(words.length).toBeGreaterThanOrEqual(3);
    for (const w of words) {
      expect(w.x1).toBeGreaterThan(w.x0);
      expect(w.y1).toBeGreaterThan(w.y0);
    }
  });

  it("finds light text inside a dark swatch", async () => {
    const img = await svgImage(
      `<rect x="40" y="30" width="120" height="50" fill="rgb(40,40,120)"/>
       <text x="52" y="62" font-family="Arial, sans-serif" font-size="24" fill="white">A11(202)</text>`,
    );
    const words = detectTextWords(
      img,
      { x0: 40, y0: 30, x1: 160, y1: 80 },
      { inside: true },
    );
    expect(words.length).toBeGreaterThanOrEqual(1);
    expect(words[0].ink).toBe("light");
    expect(words[0].x0).toBeGreaterThanOrEqual(40);
    expect(words[0].x1).toBeLessThanOrEqual(160);
  });
});
