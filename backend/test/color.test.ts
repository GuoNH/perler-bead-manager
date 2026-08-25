import { describe, expect, it } from "vitest";
import { medianRgb } from "../src/recognizer/color.js";

describe("medianRgb", () => {
  it("returns the median channel values inside the box", () => {
    const width = 3;
    const height = 2;
    const rgb = new Uint8Array(width * height * 3);
    const px = (x: number, y: number, r: number, g: number, b: number) => {
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    };
    px(0, 0, 10, 20, 30);
    px(1, 0, 50, 60, 70);
    px(2, 0, 90, 100, 110);
    px(0, 1, 200, 210, 220);
    px(1, 1, 30, 40, 50);
    px(2, 1, 250, 255, 255);
    expect(medianRgb(rgb, width, { x0: 0, y0: 0, x1: 2, y1: 2 }))
      .toEqual({ r: 40, g: 50, b: 60 });
  });
});
