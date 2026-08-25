import { describe, expect, it, vi } from "vitest";
import { runTesseract } from "../src/recognizer/ocr.js";

vi.mock("node:child_process", () => ({
  execFile: (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, stdout: string) => void) =>
    cb(null, "A10\n"),
}));

describe("runTesseract", () => {
  it("returns trimmed OCR text", async () => {
    await expect(runTesseract("fake.png", { psm: 7 })).resolves.toBe("A10");
  });
});
