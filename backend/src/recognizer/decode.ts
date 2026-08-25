import sharp from "sharp";

export interface DecodedImage {
  width: number;
  height: number;
  rgb: Uint8Array;
}

export async function decodeRgb(input: Buffer): Promise<DecodedImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    rgb: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}
