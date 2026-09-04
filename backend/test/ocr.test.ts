import { describe, expect, it, vi } from "vitest";
import { runTesseract, TesseractEngine } from "../src/recognizer/engines/tesseract.js";

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (e: unknown, stdout: string) => void,
  ) =>
    cb(null, [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t10\t20\t40\t20\t92\tA10",
      "5\t1\t1\t1\t1\t2\t60\t20\t50\t20\t88\t(202)",
    ].join("\n")),
}));

describe("runTesseract", () => {
  it("returns TSV word results with boxes and confidence", async () => {
    const words = await runTesseract("fake.png", { psm: 7 });
    expect(words).toHaveLength(2);
    expect(words[0]).toMatchObject({ text: "A10", x: 10, y: 20, w: 40, h: 20 });
    expect(words[0].confidence).toBe(92);
    expect(words[1].text).toBe("(202)");
  });
});

describe("TesseractEngine", () => {
  it("implements the OcrEngine interface", async () => {
    const engine = new TesseractEngine();
    expect(engine.name).toBe("tesseract");
    const words = await engine.recognize("fake.png");
    expect(words.length).toBeGreaterThan(0);
  });
});
