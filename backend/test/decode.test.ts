import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { decodeRgb } from "../src/recognizer/decode.js";

describe("decodeRgb", () => {
  it("decodes a 2x2 image into a 12-byte RGB buffer", async () => {
    const buf = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    }).png().toBuffer();
    const img = await decodeRgb(buf);
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect(img.rgb).toHaveLength(12);
    expect([img.rgb[0], img.rgb[1], img.rgb[2]]).toEqual([255, 0, 0]);
  });
});
