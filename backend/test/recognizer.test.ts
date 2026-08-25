import { describe, expect, it, vi } from "vitest";
import { recognize } from "../src/recognizer/index.js";

vi.mock("../src/recognizer/ocr.js", () => ({
  runTesseract: () => Promise.resolve(""),
  ocrCrop: async (_img: unknown, box: { y0: number }) =>
    box.y0 < 30 ? Promise.resolve("A10") : Promise.resolve("202"),
}));

describe("recognize", () => {
  it("assembles legend items from swatches", async () => {
    const w = 220;
    const h = 90;
    const svg = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${w}" height="${h}" fill="white"/>
        <rect x="20" y="25" width="40" height="40" fill="rgb(255,0,0)"/>
        <rect x="140" y="25" width="40" height="40" fill="rgb(0,128,255)"/>
      </svg>`,
    );
    const png = await import("sharp").then((s) => s.default(svg).png().toBuffer());
    const result = await recognize("test.png", png);
    expect(result.legend.length).toBeGreaterThanOrEqual(2);
    expect(result.legend[0].id).toBe("A10");
    expect(result.legend[0].count).toBe(202);
    expect(result.legend[0].rgb).toEqual({ r: 255, g: 0, b: 0 });
  });
});
