import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { Box } from "./color.js";
import type { DecodedImage } from "./decode.js";

const TESSERACT_EXE =
  process.env.TESSERACT_EXE ?? "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";

export interface TesseractOptions {
  whitelist?: string;
  psm?: number;
}

export function runTesseract(
  imagePath: string,
  opts: TesseractOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [imagePath, "stdout"];
    if (opts.whitelist) args.push("-c", `tessedit_char_whitelist=${opts.whitelist}`);
    if (opts.psm) args.push("--psm", String(opts.psm));
    execFile(TESSERACT_EXE, args, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.replace(/\s+/g, "").trim());
    });
  });
}

export async function ocrCrop(
  img: DecodedImage,
  box: Box,
  opts: TesseractOptions = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pinpin-ocr-"));
  const file = join(dir, "crop.png");
  try {
    const crop = await sharp(Buffer.from(img.rgb), {
      raw: { width: img.width, height: img.height, channels: 3 },
    })
      .extract({
        left: box.x0,
        top: box.y0,
        width: Math.max(1, box.x1 - box.x0),
        height: Math.max(1, box.y1 - box.y0),
      })
      .png()
      .toBuffer();
    await writeFile(file, crop);
    return await runTesseract(file, opts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
