import sharp from "sharp";
import { pixelate, type Color } from "./pixelate";

export type FrameTransform = {
  sourceWidth: number; sourceHeight: number;
  sourceBounds: { left: number; top: number; width: number; height: number };
  placement: { left: number; top: number };
  targetWidth: number; targetHeight: number;
};

/** Apply one reviewed reference transform to every frame, including areas outside its bounds. */
export async function transformFrame(input: Buffer, transform: FrameTransform, palette: Color[]) {
  const { sourceBounds: b, placement: p, targetWidth: tw, targetHeight: th } = transform;
  const values = [transform.sourceWidth, transform.sourceHeight, b.width, b.height, tw, th];
  if (values.some(v => !Number.isInteger(v) || v <= 0) ||
      [b.left, b.top, p.left, p.top].some(v => !Number.isInteger(v) || v < 0) ||
      b.left + b.width > transform.sourceWidth || b.top + b.height > transform.sourceHeight ||
      p.left + tw > 64 || p.top + th > 64) throw new Error("Invalid fixed frame transform");
  const { data, info } = await sharp(input).ensureAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (info.width !== transform.sourceWidth || info.height !== transform.sourceHeight) throw new Error("Frame source dimensions changed");
  const out = Buffer.alloc(64 * 64 * 4);
  // Check every source pixel: never silently discard a moving weapon outside the output canvas.
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 128) continue;
    const dx = p.left + (x - b.left) * tw / b.width;
    const dy = p.top + (y - b.top) * th / b.height;
    if (dx < 0 || dx >= 64 || dy < 0 || dy >= 64) throw new Error("Frame foreground would be clipped");
  }
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const sx = Math.floor(b.left + (x - p.left + 0.5) * b.width / tw);
    const sy = Math.floor(b.top + (y - p.top + 0.5) * b.height / th);
    if (sx < 0 || sx >= info.width || sy < 0 || sy >= info.height) continue;
    const si = (sy * info.width + sx) * 4;
    data.copy(out, (y * 64 + x) * 4, si, si + 4);
  }
  const png = await sharp(out, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  return pixelate(png, { resolution: 64, palette: "16", sourceKind: "pixel", sharedPalette: palette });
}
